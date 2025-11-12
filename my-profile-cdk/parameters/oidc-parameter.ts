import * as cdk from "aws-cdk-lib";

export interface GitHubProps {
  owner: string;
  repo: string;
  branch: string;
}

export interface CicdOidcRoleProperty {
  gitHub: GitHubProps;
  useExistingProviderArn?: string;
}

export interface CicdOidcRoleStackProperty {
  env: cdk.Environment;
  props: CicdOidcRoleProperty;
}

export const cicdOidcRoleStackProperty: CicdOidcRoleStackProperty = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  props: {
    gitHub: {
      owner: "miyazaki-dev01",
      repo: "my-profile",
      branch: "main",
    },
  },
};
