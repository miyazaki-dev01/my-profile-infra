import * as cdk from "aws-cdk-lib";

export interface SesParams {
  mailFromSubdomain: string;
}

export interface LambdaParams {
  fromLocalPart: string;
  fixedToGmail: string;
  allowedOrigins: string[];
}

export interface ApiGatewayParams {
  allowedOrigins: string[];
  stageName?: string;
  throttle: {
    burst: number;
    rate: number;
  };
}

export interface MailApiProperty {
  ses: SesParams;
  lambda: LambdaParams;
  apiGateway: ApiGatewayParams;
}

export interface MailApiStackProperty {
  env: cdk.Environment;
  props: MailApiProperty;
}

const allowedOrigins = [
  "https://miyazaki-profile.com",
  "http://localhost:3000",
];

export const mailApiStackProperty: MailApiStackProperty = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  props: {
    ses: {
      mailFromSubdomain: "mail",
    },
    lambda: {
      fromLocalPart: "no-reply",
      fixedToGmail: "miyazaki.dev01@gmail.com",
      allowedOrigins: allowedOrigins,
    },
    apiGateway: {
      allowedOrigins: allowedOrigins,
      stageName: "prod",
      throttle: {
        burst: 5,
        rate: 10,
      },
    },
  },
};
