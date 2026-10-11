import ipaddress
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class RuntimeNetworkRelationships(unittest.TestCase):
    def sanitize(self, files):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            output = Path(directory) / "output"
            source.mkdir()
            for name, data in files.items():
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(data), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, "-B", str(ROOT / "scripts/sanitize_aws_export.py"),
                 str(source), "-o", str(output), "--seed", "42"],
                text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            return {name: json.loads((output / name).read_text()) for name in files}

    def test_instance_ip_and_shared_rule_remain_in_the_subnet(self):
        files = {
            "vpcs.json": {"Vpcs": [{"VpcId": "vpc-11111111", "CidrBlock": "172.20.0.0/16"}]},
            "subnets.json": {"Subnets": [{"VpcId": "vpc-11111111", "CidrBlock": "172.20.1.0/24"}]},
            "instances.json": {"Instances": [{"PrivateIpAddress": "172.20.1.10"}]},
            "rules.json": {"IpRanges": [{"CidrIp": "172.20.0.0/16"}, {"CidrIp": "172.20.1.10/32"}]},
        }
        result = self.sanitize(files)
        address = ipaddress.ip_address(result["instances.json"]["Instances"][0]["PrivateIpAddress"])
        for original, value in [("172.20.0.0/16", result["vpcs.json"]["Vpcs"][0]["CidrBlock"]),
                                ("172.20.1.0/24", result["subnets.json"]["Subnets"][0]["CidrBlock"])]:
            self.assertNotEqual(value, original)
            self.assertIn(address, ipaddress.ip_network(value))
        for rule in result["rules.json"]["IpRanges"]:
            self.assertIn(address, ipaddress.ip_network(rule["CidrIp"]))
        self.assertNotIn("172.20.", json.dumps(result))

    def test_nested_and_unrelated_networks_keep_membership(self):
        files = {"networks.json": {
            "Vpcs": [{"VpcId": "vpc-11111111", "CidrBlock": "172.20.0.0/16"},
                     {"VpcId": "vpc-22222222", "CidrBlock": "192.168.0.0/16"}],
            "Subnets": [{"VpcId": "vpc-11111111", "CidrBlock": "172.20.1.0/24"},
                        {"VpcId": "vpc-11111111", "CidrBlock": "172.20.2.0/24"}],
            "rules": [{"CidrIp": "172.20.0.0/16"}, {"CidrIp": "172.20.1.0/25"}],
            "addresses": [{"PrivateIpAddress": "172.20.1.10"},
                          {"PrivateIpAddress": "172.20.1.200"},
                          {"PrivateIpAddress": "172.20.2.10"},
                          {"PrivateIpAddress": "192.168.2.10"}],
        }}
        data = self.sanitize(files)["networks.json"]
        addresses = [ipaddress.ip_address(row["PrivateIpAddress"]) for row in data["addresses"]]
        subnet = ipaddress.ip_network(data["Subnets"][0]["CidrBlock"])
        for address in addresses[:2]:
            self.assertIn(address, subnet)
        for original, sanitized in zip(files["networks.json"]["rules"], data["rules"]):
            before = ipaddress.ip_network(original["CidrIp"])
            after = ipaddress.ip_network(sanitized["CidrIp"])
            for old, new in zip(files["networks.json"]["addresses"], addresses):
                self.assertEqual(ipaddress.ip_address(old["PrivateIpAddress"]) in before, new in after)
        self.assertEqual(len(set(addresses)), 4)

    def test_mapping_is_independent_of_file_and_object_order(self):
        address = {"PrivateIpAddress": "172.20.3.9"}
        cidrs = {"VpcId": "vpc-11111111", "CidrBlock": "172.20.0.0/16"}
        nested = {"CidrIp": "172.20.3.0/24"}
        first = self.sanitize({"a.json": {"ip": address, "rule": nested}, "z.json": {"Vpcs": [cidrs]}})
        second = self.sanitize({"a.json": {"Vpcs": [cidrs]}, "z.json": {"rule": nested, "ip": address}})
        self.assertEqual(first["a.json"]["ip"], second["z.json"]["ip"])
        self.assertEqual(first["a.json"]["rule"], second["z.json"]["rule"])
        self.assertEqual(first["z.json"]["Vpcs"], second["a.json"]["Vpcs"])
        self.assertIn(ipaddress.ip_address(first["a.json"]["ip"]["PrivateIpAddress"]),
                      ipaddress.ip_network(first["a.json"]["rule"]["CidrIp"]))


if __name__ == "__main__":
    unittest.main()
