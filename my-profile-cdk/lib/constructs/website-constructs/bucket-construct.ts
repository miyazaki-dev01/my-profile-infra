import { Construct } from "constructs";
import { aws_s3 as s3, RemovalPolicy } from "aws-cdk-lib";
import { BucketProperty } from "@/parameters/website-parameter";

export interface BucketConstructProps extends BucketProperty {}

export class BucketConstruct extends Construct {
  readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: BucketConstructProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "Bucket", {
      bucketName: props?.bucketName,                             // 新規作成時のバケット名

      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,         // 公開アクセスをブロック
      enforceSSL: true,                                          // SSL 強制
      encryption: s3.BucketEncryption.S3_MANAGED,                // サーバー側暗号化（SSE-S3）
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED, // ACLを無効化して所有権をバケット側に強制

      versioned: false,                                          // バージョニングはオフ

      removalPolicy: RemovalPolicy.DESTROY,                      // Destroy 方針
      autoDeleteObjects: true,                                   // Destroy 時に中身も消す
    });
  }
}
