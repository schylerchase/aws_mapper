import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

global.window = {};

const { _generateCLI } = await import('../../src/modules/design-mode.js');

describe('_generateCLI', () => {
  it('shell-quotes design values before building commands', () => {
    const [cmd] = _generateCLI({
      action: 'add_security_group',
      params: {
        Name: "web'; aws s3 ls",
        Description: 'prod "sg"; touch /tmp/pwn',
        VpcId: 'vpc-123'
      }
    });

    assert.equal(
      cmd,
      "aws ec2 create-security-group --group-name 'web'\\''; aws s3 ls' --description 'prod \"sg\"; touch /tmp/pwn' --vpc-id 'vpc-123'"
    );
  });

  it('shell-quotes tag specifications', () => {
    const [cmd] = _generateCLI({
      action: 'add_vpc',
      params: {
        CidrBlock: '10.10.0.0/16',
        Name: "prod'; aws iam list-users"
      }
    });

    assert.equal(
      cmd,
      "aws ec2 create-vpc --cidr-block '10.10.0.0/16' --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=prod'\\''; aws iam list-users}]'"
    );
  });
});
