import * as cdk from "aws-cdk-lib";

export interface EdgeCertProperty {
  certificateDomainName?: string;
  certificateArn?: string;
}

export interface EdgeCertStackProperty {
  env: cdk.Environment;
  props: EdgeCertProperty;
}

export const edgeCertStackProperty: EdgeCertStackProperty = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1", // CloudFront用証明書は必ず us-east-1 で発行
  },
  props: {
    certificateDomainName: "miyazaki-profile.com",
  },
};
