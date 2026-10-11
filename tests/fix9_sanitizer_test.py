import ipaddress
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class PublicNetworkMappingTests(unittest.TestCase):
    def sanitize(self, files):
        with tempfile.TemporaryDirectory(prefix="aws-fix9-sanitizer-") as directory:
            source = Path(directory) / "source"
            output = Path(directory) / "output"
            source.mkdir()
            for name, data in files.items():
                target = source / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(json.dumps(data), encoding="utf-8")
            result = subprocess.run([sys.executable, "-B", str(ROOT / "scripts/sanitize_aws_export.py"),
                                     str(source), "-o", str(output), "--seed", "42"],
                                    text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            return {name: json.loads((output / name).read_text(encoding="utf-8")) for name in files}

    def test_public_sg_ranges_keep_membership_and_private_controls(self):
        fixture = {"Instances": [{"PublicIpAddress": "18.20.30.40", "PrivateIpAddress": "172.20.1.10"}],
                   "SecurityGroups": [{"IpPermissions": [
                       {"IpProtocol": "tcp", "FromPort": 443, "ToPort": 443,
                        "IpRanges": [{"CidrIp": "18.20.30.0/24"}]},
                       {"IpProtocol": "tcp", "FromPort": 8443, "ToPort": 8443,
                        "IpRanges": [{"CidrIp": "172.20.1.0/24"}]}]}]}
        actual = self.sanitize({"network.json": fixture})["network.json"]
        for key, index in [("PublicIpAddress", 0), ("PrivateIpAddress", 1)]:
            address = ipaddress.ip_address(actual["Instances"][0][key])
            cidr = actual["SecurityGroups"][0]["IpPermissions"][index]["IpRanges"][0]["CidrIp"]
            self.assertIn(address, ipaddress.ip_network(cidr))
            self.assertNotIn(fixture["Instances"][0][key], json.dumps(actual))
        self.assertEqual(actual["SecurityGroups"][0]["IpPermissions"][0]["FromPort"], 443)

    def test_nested_public_networks_preserve_all_positive_and_negative_matches(self):
        ips = ["18.20.30.40", "18.20.30.200", "18.20.40.50", "19.30.40.50", "20.40.50.60"]
        cidrs = ["18.20.0.0/16", "18.20.30.0/24", "18.20.30.0/25", "18.20.30.40/32", "19.30.0.0/16"]
        fixture = {"Instances": [{"PublicIpAddress": ip} for ip in ips],
                   "Rules": [{"CidrIp": cidr} for cidr in cidrs]}
        actual = self.sanitize({"networks.json": fixture})["networks.json"]
        mapped_ips = [row["PublicIpAddress"] for row in actual["Instances"]]
        mapped_cidrs = [row["CidrIp"] for row in actual["Rules"]]
        self.assertEqual(len(set(mapped_ips)), len(ips))
        for old_ip, new_ip in zip(ips, mapped_ips):
            self.assertNotEqual(old_ip, new_ip)
            for old_cidr, new_cidr in zip(cidrs, mapped_cidrs):
                self.assertEqual(ipaddress.ip_address(old_ip) in ipaddress.ip_network(old_cidr),
                                 ipaddress.ip_address(new_ip) in ipaddress.ip_network(new_cidr))

    def test_object_and_encoded_policy_ranges_are_order_independent_for_public_hosts(self):
        values = ["18.20.0.0/16", "18.20.30.0/24", "18.20.30.40/32", "18.20.30.40", "0.0.0.0/0"]
        policy = {"Statement": {"Effect": "Allow", "Action": "s3:GetObject", "Resource": "*",
                               "Condition": {"IpAddress": {"aws:SourceIp": values}}}}
        results = []
        for encoded in [False, True]:
            for host_first in [False, True]:
                with self.subTest(encoded=encoded, host_first=host_first):
                    host_name, policy_name = ("a.json", "z.json") if host_first else ("z.json", "a.json")
                    actual = self.sanitize({host_name: {"PublicIpAddress": "18.20.30.40"},
                                            policy_name: {"Document": json.dumps(policy) if encoded else policy}})
                    host = actual[host_name]["PublicIpAddress"]
                    document = actual[policy_name]["Document"]
                    self.assertEqual(isinstance(document, str), encoded)
                    document = json.loads(document) if encoded else document
                    mapped = document["Statement"]["Condition"]["IpAddress"]["aws:SourceIp"]
                    for cidr in mapped[:3]:
                        self.assertIn(ipaddress.ip_address(host), ipaddress.ip_network(cidr))
                    self.assertEqual(mapped[3], host)
                    self.assertEqual(mapped[4], "0.0.0.0/0")
                    self.assertEqual(document["Statement"]["Action"], "s3:GetObject")
                    results.append((host, mapped))
        self.assertTrue(all(result == results[0] for result in results))

    def test_public_hosts_without_specific_networks_keep_documentation_addresses(self):
        policy = {"Statement": {"Effect": "Deny", "Action": "s3:*", "Resource": "*",
                               "Condition": {"NotIpAddress": {"aws:SourceIp": ["18.20.30.40", "0.0.0.0/0", "::/0"]}}}}
        actual = self.sanitize({"hosts.json": {"PublicIpAddress": "18.20.30.40", "Document": policy}})["hosts.json"]
        address = ipaddress.ip_address(actual["PublicIpAddress"])
        documentation = [ipaddress.ip_network(cidr) for cidr in ["192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24"]]
        self.assertTrue(any(address in cidr for cidr in documentation))
        self.assertNotEqual(str(address), "18.20.30.40")
        self.assertEqual(actual["Document"]["Statement"]["Condition"]["NotIpAddress"]["aws:SourceIp"],
                         [str(address), "0.0.0.0/0", "::/0"])


if __name__ == "__main__":
    unittest.main()
