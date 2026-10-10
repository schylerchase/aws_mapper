import copy
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "sanitizer", Path(__file__).resolve().parents[1] / "scripts/sanitize_aws_export.py"
)
sanitizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sanitizer)


class ObjectStatementTests(unittest.TestCase):
    def test_object_permission_statement_sanitizes_resource_and_condition(self):
        policy = {"Version": "2012-10-17", "Statement": {
            "Sid": "ListBucket", "Effect": "Allow", "Action": ["s3:ListBucket"],
            "Resource": "arn:aws:s3:::customer-project",
            "Condition": {"StringEquals": {"aws:SourceAccount": "123456789012"}}}}
        original = copy.deepcopy(policy)
        output = sanitizer.deep_sanitize({"PolicyDocument": policy},
                                         sanitizer.SanitizationRegistry(42))["PolicyDocument"]
        statement = output["Statement"]
        self.assertIsInstance(statement, dict)
        self.assertNotEqual(statement["Resource"], original["Statement"]["Resource"])
        self.assertNotIn("123456789012", json.dumps(output))
        self.assertEqual(statement["Effect"], "Allow")
        self.assertEqual(statement["Action"], ["s3:ListBucket"])
        self.assertEqual(statement["Sid"], "ListBucket")
        self.assertEqual(policy, original)

    def test_object_trust_statement_matches_array_form_in_dict_and_json_documents(self):
        statement = {"Effect": "Allow", "Action": "sts:AssumeRole", "Principal": {
            "AWS": "arn:aws:iam::123456789012:role/customer-production"}}
        for field in ["PolicyDocument", "Document", "AssumeRolePolicyDocument"]:
            for encoded in [False, True]:
                with self.subTest(field=field, encoded=encoded):
                    object_policy = {"Version": "2012-10-17", "Statement": statement}
                    array_policy = {"Version": "2012-10-17", "Statement": [statement]}
                    if encoded:
                        object_policy, array_policy = json.dumps(object_policy), json.dumps(array_policy)
                    object_result = sanitizer.deep_sanitize({field: object_policy},
                        sanitizer.SanitizationRegistry(42))[field]
                    array_result = sanitizer.deep_sanitize({field: array_policy},
                        sanitizer.SanitizationRegistry(42))[field]
                    if encoded:
                        object_result, array_result = json.loads(object_result), json.loads(array_result)
                    self.assertEqual(object_result["Statement"], array_result["Statement"][0])
                    self.assertNotIn("customer-production", json.dumps(object_result))


if __name__ == "__main__":
    unittest.main()
