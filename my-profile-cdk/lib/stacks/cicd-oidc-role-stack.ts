import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import { CicdOidcRoleStackProperty } from "@/parameters/oidc-parameter";

export interface CicdOidcRoleStackProps
  extends cdk.StackProps,
    Omit<CicdOidcRoleStackProperty, "env"> {
  bucketName: string;
  distributionId: string;
}

export class CicdOidcRoleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CicdOidcRoleStackProps) {
    super(scope, id, props);

    const branch = props.props.gitHub.branch ?? "main"; // 未指定なら main 限定

    // GitHub OIDC Provider（既存再利用 or 新規作成）
    const provider = props.props.useExistingProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          "GithubOidcProviderImported",
          props.props.useExistingProviderArn
        )
      : new iam.OpenIdConnectProvider(this, "GithubOidcProvider", {
          url: "https://token.actions.githubusercontent.com",
          clientIds: ["sts.amazonaws.com"],
        });

    // OIDC 信頼条件（repo/branch を厳密化）
    const principal = new iam.OpenIdConnectPrincipal(provider).withConditions({
      StringEquals: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      },
      StringLike: {
        "token.actions.githubusercontent.com:sub": `repo:${props.props.gitHub.owner}/${props.props.gitHub.repo}:ref:refs/heads/${branch}`,
      },
    });

    // IAM Role（GitHub Actions 用）
    const role = new iam.Role(this, "GithubActionsDeployerRole", {
      assumedBy: principal,
      description:
        "OIDC for GitHub Actions: least-privilege deploy to S3 + CloudFront invalidation",
      roleName: "github-actions-oidc-deployer",
    });

    // S3 最小権限（対象バケット限定）
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [`arn:aws:s3:::${props.bucketName}`],
      })
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:DeleteObject"],
        resources: [`arn:aws:s3:::${props.bucketName}/*`],
      })
    );

    // CloudFront 無効化（Distribution 限定）
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudfront:CreateInvalidation"],
        resources: [
          `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${
            props.distributionId
          }`,
        ],
      })
    );

    // 出力（GitHub Actions 側で使う Assume Role ARN）
    new cdk.CfnOutput(this, "DeployerRoleArn", {
      value: role.roleArn,
      description: "AssumeRole ARN for GitHub Actions (role-to-assume)",
    });

    // OIDC Provider の ARN を出力
    new cdk.CfnOutput(this, "OidcProviderArn", {
      value: provider.openIdConnectProviderArn,
      description: "GitHub OIDC Provider ARN referenced by this stack",
    });
  }
}
