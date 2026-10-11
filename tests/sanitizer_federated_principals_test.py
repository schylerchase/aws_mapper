import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "sanitizer", Path(__file__).resolve().parents[1] / "scripts/sanitize_aws_export.py"
)
sanitizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sanitizer)


class FederatedPrincipalTests(unittest.TestCase):
    def test_saml_and_oidc_arns_are_sanitized_with_the_enclosing_role(self):
        for provider in ["saml-provider/customer-directory", "oidc-provider/customer.example"]:
            with self.subTest(provider=provider):
                arn = "arn:aws:iam::123456789012:" + provider
                registry = sanitizer.SanitizationRegistry(42)
                data = {"RoleDetailList": [{"Arn": "arn:aws:iam::123456789012:role/customer-app",
                    "AssumeRolePolicyDocument": {"Statement": [{"Effect": "Allow",
                        "Action": "sts:AssumeRoleWithWebIdentity" if provider.startswith("oidc-") else "sts:AssumeRoleWithSAML",
                        "Principal": {"Federated": arn}}]}}]}
                output = sanitizer.deep_sanitize(data, registry)
                role = output["RoleDetailList"][0]
                actual = role["AssumeRolePolicyDocument"]["Statement"][0]["Principal"]["Federated"]
                self.assertEqual(actual, registry.map_arn(arn))
                self.assertNotIn("123456789012", json.dumps(output))
                self.assertNotIn(provider, json.dumps(output))
                self.assertEqual(actual.split(":")[4], role["Arn"].split(":")[4])

    def test_lists_notprincipal_and_builtin_provider_names_keep_policy_shape(self):
        registry = sanitizer.SanitizationRegistry(42)
        arn = "arn:aws:iam::123456789012:saml-provider/customer-directory"
        policy = {"Statement": [{"Effect": "Deny", "Action": "sts:AssumeRoleWithSAML",
            "NotPrincipal": {"Federated": [arn, "accounts.google.com"],
                             "Service": ["lambda.amazonaws.com", "ec2.amazonaws.com"]}}]}
        output = sanitizer.deep_sanitize({"Document": json.dumps(policy)}, registry)
        principal = json.loads(output["Document"])["Statement"][0]["NotPrincipal"]
        self.assertEqual(principal["Federated"], [registry.map_arn(arn), "accounts.google.com"])
        self.assertEqual(principal["Service"], policy["Statement"][0]["NotPrincipal"]["Service"])
        self.assertEqual(policy["Statement"][0]["NotPrincipal"]["Federated"][0], arn)


if __name__ == "__main__":
    unittest.main()
