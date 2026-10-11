import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "sanitizer", Path(__file__).resolve().parents[1] / "scripts/sanitize_aws_export.py"
)
sanitizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sanitizer)


class Ipv4ConditionTests(unittest.TestCase):
    def test_source_ip_addresses_and_cidrs_match_inventory_mappings(self):
        registry = sanitizer.SanitizationRegistry(42)
        values = ["10.20.30.0/24", "10.20.30.15", "8.8.4.0/24", "8.8.4.4"]
        expected = [registry.map_cidr(values[0]), registry.map_private_ip(values[1]),
                    registry.map_cidr(values[2]), registry.map_public_ip(values[3])]
        policy = {"Statement": [{"Effect": "Allow", "Action": "s3:GetObject",
                               "Resource": "*", "Condition": {
                                   "IpAddress": {"aws:SourceIp": values}}}]}
        output = sanitizer.deep_sanitize({"PolicyDocument": policy}, registry)
        actual = output["PolicyDocument"]["Statement"][0]["Condition"]["IpAddress"]["aws:SourceIp"]
        self.assertEqual(actual, expected)
        for original in values:
            self.assertNotIn(original, json.dumps(output))
        self.assertEqual(policy["Statement"][0]["Condition"]["IpAddress"]["aws:SourceIp"], values)

    def test_json_encoded_conditions_preserve_universal_cidr_and_structure(self):
        policy = {"Version": "2012-10-17", "Statement": [{"Effect": "Deny",
                  "Action": "s3:*", "Resource": "*", "Condition": {
                      "NotIpAddress": {"aws:SourceIp": ["0.0.0.0/0", "10.50.0.0/16"]},
                      "StringEquals": {"custom:label": "not-an-ip"}}}]}
        output = sanitizer.deep_sanitize({"Document": json.dumps(policy)},
                                         sanitizer.SanitizationRegistry(42))
        result = json.loads(output["Document"])
        self.assertEqual(result["Version"], policy["Version"])
        statement = result["Statement"][0]
        self.assertEqual(statement["Action"], "s3:*")
        self.assertEqual(statement["Condition"]["NotIpAddress"]["aws:SourceIp"][0], "0.0.0.0/0")
        self.assertNotEqual(statement["Condition"]["NotIpAddress"]["aws:SourceIp"][1], "10.50.0.0/16")
        self.assertEqual(statement["Condition"]["StringEquals"]["custom:label"], "not-an-ip")


if __name__ == "__main__":
    unittest.main()
