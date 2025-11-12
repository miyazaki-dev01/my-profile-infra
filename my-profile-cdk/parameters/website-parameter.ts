import * as cdk from "aws-cdk-lib";

export interface BucketProperty {
  bucketName?: string;
}

export interface ContentsDeliveryProperty {
  domainName: string;
  enableDirectoryIndex: "cf2" | false;
}

export interface WebsiteProperty {
  contentsDelivery: ContentsDeliveryProperty;
  bucket: BucketProperty;
}

export interface WebSiteStackProperty {
  env: cdk.Environment;
  props: WebsiteProperty;
}

export const websiteStackProperty: WebSiteStackProperty = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  props: {
    contentsDelivery: {
      domainName: "miyazaki-profile.com",
      enableDirectoryIndex: "cf2",
    },
    bucket: {
      bucketName: "miyazaki-website-bucket",
    },
  },
};
