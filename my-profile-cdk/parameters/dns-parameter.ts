import * as cdk from "aws-cdk-lib";

export interface HostZoneProperty {
  zoneName?: string;
  hostedZoneId?: string;
}

export interface DnsStackProperty {
  env: cdk.Environment;
  props: { hostedZone: HostZoneProperty };
}

export const dnsStackProperty: DnsStackProperty = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  props: {
    hostedZone: {
      zoneName: "miyazaki-profile.com",
    },
  },
};
