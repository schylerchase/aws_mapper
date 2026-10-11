import fnmatch
import ipaddress
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
ISSUER = "oidc.eks.us-west-2.amazonaws.com/id/MOCKISSUER0123"
PROVIDER = "arn:aws:iam::111122223333:oidc-provider/" + ISSUER
SUBJECT = "system:serviceaccount:mock-payments:mock-billing"


class Fix15SanitizerTests(unittest.TestCase):
    def sanitize(self, files):
        with tempfile.TemporaryDirectory(prefix="aws-fix15-sanitizer-") as directory:
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

    def test_encoded_source_ip_networks_precede_hosts_and_match_object_documents(self):
        policy = {"Statement": [{"Effect": "Allow", "Action": "s3:GetObject", "Resource": "*",
                                "Condition": {"IpAddress": {"aws:SourceIp": ["172.20.1.0/24", "172.20.1.10/32"]}}}]}
        hosts = {"Instances": [{"PrivateIpAddress": "172.20.1.10"}]}
        results = []
        for encoded in [False, True]:
            for host_first in [False, True]:
                with self.subTest(encoded=encoded, host_first=host_first):
                    doc = json.dumps(policy) if encoded else policy
                    files = {("a.json" if host_first else "z.json"): hosts,
                             ("z.json" if host_first else "a.json"): {"Document": doc}}
                    result = self.sanitize(files)
                    host = result["a.json" if host_first else "z.json"]["Instances"][0]["PrivateIpAddress"]
                    sanitized = result["z.json" if host_first else "a.json"]["Document"]
                    self.assertEqual(isinstance(sanitized, str), encoded)
                    sanitized = json.loads(sanitized) if encoded else sanitized
                    cidrs = sanitized["Statement"][0]["Condition"]["IpAddress"]["aws:SourceIp"]
                    for cidr in cidrs:
                        self.assertIn(ipaddress.ip_address(host), ipaddress.ip_network(cidr))
                    self.assertNotIn("172.20.", json.dumps(result))
                    results.append((host, cidrs))
        self.assertTrue(all(result == results[0] for result in results))

    def test_oidc_provider_claim_keys_and_service_accounts_are_related_in_both_policy_forms(self):
        for encoded in [False, True]:
            for statement_list in [False, True]:
                with self.subTest(encoded=encoded, statement_list=statement_list):
                    statement = {"Condition": {"StringEquals": {
                        ISSUER + ":aud": "sts.amazonaws.com", ISSUER + ":sub": SUBJECT}},
                        "Effect": "Allow", "Principal": {"Federated": PROVIDER},
                        "Action": "sts:AssumeRoleWithWebIdentity", "Resource": "*"}
                    policy = {"Version": "2012-10-17", "Statement": [statement] if statement_list else statement}
                    doc = json.dumps(policy) if encoded else policy
                    result = self.sanitize({"iam.json": {"Arn": PROVIDER, "RoleDetailList": [{
                        "RoleName": "mock-role", "AssumeRolePolicyDocument": doc}]}})["iam.json"]
                    mapped = result["RoleDetailList"][0]["AssumeRolePolicyDocument"]
                    self.assertEqual(isinstance(mapped, str), encoded)
                    mapped = json.loads(mapped) if encoded else mapped
                    actual = mapped["Statement"][0] if statement_list else mapped["Statement"]
                    provider = actual["Principal"]["Federated"]
                    issuer = provider.split(":oidc-provider/", 1)[1]
                    self.assertEqual(result["Arn"], provider)
                    self.assertEqual(actual["Condition"]["StringEquals"][issuer + ":aud"], "sts.amazonaws.com")
                    subject = actual["Condition"]["StringEquals"][issuer + ":sub"]
                    self.assertTrue(subject.startswith("system:serviceaccount:"))
                    self.assertNotIn("mock-payments", subject)
                    self.assertNotIn("mock-billing", subject)
                    self.assertNotIn(ISSUER, json.dumps(result))
                    self.assertEqual(actual["Action"], statement["Action"])
                    self.assertEqual(actual["Resource"], "*")
                    self.assertEqual(mapped["Version"], "2012-10-17")

    def test_oidc_lists_notprincipal_and_globs_preserve_claim_matching(self):
        issuer2 = "login.mock.example/id/OTHERISSUER"
        provider2 = "arn:aws:iam::111122223333:oidc-provider/" + issuer2
        literals = [SUBJECT, "system:serviceaccount:mock-payments:mock-billing-api",
                    "system:serviceaccount:other-namespace:unrelated"]
        patterns = ["system:serviceaccount:mock-payments:mock-billing*", "system:serviceaccount:*:*"]
        statement = {"Effect": "Deny", "NotPrincipal": {"Federated": [PROVIDER, provider2, "accounts.google.com"],
                                                               "Service": "lambda.amazonaws.com"},
                     "NotAction": "sts:AssumeRoleWithWebIdentity", "Condition": {
                         "StringEquals": {ISSUER + ":sub": literals, ISSUER + ":aud": ["sts.amazonaws.com"]},
                         "StringLike": {issuer2 + ":sub": patterns},
                         "Bool": {"aws:SecureTransport": "true"}}}
        actual = self.sanitize({"iam.json": {"Document": {"Statement": statement}}})["iam.json"]["Document"]["Statement"]
        principals = actual["NotPrincipal"]["Federated"]
        mapped_issuers = [value.split(":oidc-provider/", 1)[1] for value in principals[:2]]
        self.assertNotEqual(mapped_issuers[0], mapped_issuers[1])
        self.assertEqual(principals[2], "accounts.google.com")
        self.assertEqual(actual["NotPrincipal"]["Service"], "lambda.amazonaws.com")
        self.assertEqual(actual["NotAction"], statement["NotAction"])
        self.assertEqual(actual["Condition"]["Bool"], {"aws:SecureTransport": "true"})
        mapped_literals = actual["Condition"]["StringEquals"][mapped_issuers[0] + ":sub"]
        mapped_patterns = actual["Condition"]["StringLike"][mapped_issuers[1] + ":sub"]
        for old_pattern, new_pattern in zip(patterns, mapped_patterns):
            self.assertEqual(old_pattern.count("*"), new_pattern.count("*"))
            for old_literal, new_literal in zip(literals, mapped_literals):
                self.assertEqual(fnmatch.fnmatchcase(old_literal, old_pattern),
                                 fnmatch.fnmatchcase(new_literal, new_pattern))
        self.assertNotIn("mock-payments", json.dumps(actual))
        self.assertNotIn("mock-billing", json.dumps(actual))

    def test_non_oidc_conditions_and_builtin_audiences_remain_unchanged(self):
        policy = {"Statement": [{"Effect": "Allow", "Action": "sts:AssumeRoleWithWebIdentity",
                  "Principal": {"Federated": "accounts.google.com"}, "Condition": {
                  "StringEquals": {"accounts.google.com:aud": "mock-client-id", "aws:PrincipalType": "Role"}}}]}
        actual = self.sanitize({"iam.json": {"Document": policy}})["iam.json"]["Document"]
        self.assertEqual(actual, policy)

    def test_oidc_claims_in_separate_deny_statement_share_the_provider_identity(self):
        deny = {"Effect": "Deny", "Principal": "*", "Action": "sts:AssumeRoleWithWebIdentity",
                "Condition": {"StringNotEquals": {ISSUER + ":sub": SUBJECT, ISSUER + ":aud": "sts.amazonaws.com"}}}
        allow = {"Effect": "Allow", "Principal": {"Federated": PROVIDER},
                 "Action": "sts:AssumeRoleWithWebIdentity",
                 "Condition": {"StringEquals": {ISSUER + ":sub": SUBJECT, ISSUER + ":aud": "sts.amazonaws.com"}}}
        policy = {"Statement": [deny, allow]}
        for encoded in [False, True]:
            with self.subTest(encoded=encoded):
                document = json.dumps(policy) if encoded else policy
                actual = self.sanitize({"iam.json": {"Document": document}})["iam.json"]["Document"]
                actual = json.loads(actual) if encoded else actual
                mapped_deny, mapped_allow = actual["Statement"]
                issuer = mapped_allow["Principal"]["Federated"].split(":oidc-provider/", 1)[1]
                self.assertEqual(mapped_deny["Principal"], "*")
                self.assertEqual(mapped_deny["Condition"]["StringNotEquals"],
                                 mapped_allow["Condition"]["StringEquals"])
                self.assertEqual(mapped_deny["Condition"]["StringNotEquals"][issuer + ":aud"], "sts.amazonaws.com")
                self.assertNotIn(ISSUER, json.dumps(actual))
                self.assertNotIn("mock-payments", json.dumps(actual))
                self.assertNotIn("mock-billing", json.dumps(actual))


if __name__ == "__main__":
    unittest.main()
