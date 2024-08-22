import * as core from "@actions/core";
import * as github from "@actions/github";
import fs from "node:fs";

import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import {
  ElasticBeanstalkClient,
  CreateApplicationVersionCommand,
} from "@aws-sdk/client-elastic-beanstalk";

import archiver from "archiver";
import stream from "stream";

async function uploadZipToS3({ region, bucketName, zipFileName, filesToZip }) {
  const s3 = new S3Client({
    region,
  });

  const passThroughStream = new stream.PassThrough();

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucketName,
      Key: zipFileName,
      Body: passThroughStream,
      ContentType: "application/zip",
    },
  });

  const s3UploadPromise = upload.done();

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    throw err;
  });

  // Pipe the archive's output to the pass through stream
  archive.pipe(passThroughStream);

  // Append files to the archive
  filesToZip.forEach((file) => {
    const fileStream = fs.createReadStream(file.path);
    archive.append(fileStream, { name: file.name });
  });

  // Finalize the archive
  archive.finalize();

  // Wait for the S3 upload to complete
  try {
    const response = await s3UploadPromise;
    console.log("Upload complete:", response);
  } catch (err) {
    console.error("Upload failed:", err);
    throw err;
  }
}

async function createApplicationVersion({
  region,
  applicationName,
  versionLabel,
  sha,
  bucketName,
  zipFileName,
  commitMessage,
}) {
  const eb = new ElasticBeanstalkClient({
    logger: console,
    region,
  });
  const command = new CreateApplicationVersionCommand({
    ApplicationName: applicationName,
    VersionLabel: versionLabel,
    SourceBundle: {
      S3Bucket: bucketName,
      S3Key: zipFileName,
    },
    AutoCreateApplication: false,
    // pre-processes files to look for issues
    Process: false,
    Description: (commitMessage || "").split("\n")[0].substr(0, 199),
    Tags: [
      {
        Key: "sha",
        Value: sha,
      },
    ],
  });
  const response = await eb.send(command);
  console.log(response);
}

export async function run() {
  try {
    const workingDirectory = core.getInput("working-directory");
    const files = JSON.parse(core.getInput("files", { required: true }));
    const region = core.getInput("aws-region");
    const bucketName = core.getInput("bucket");
    const applicationName = core.getInput("application-name");
    const sha = github.context.sha;
    const runNumber = github.context.runNumber;

    // Waiting for a new release of @actions/github
    const runAttempt = parseInt(process.env.GITHUB_RUN_ATTEMPT as string, 10);

    const commitMessage = github.context.payload?.head_commit?.message;

    const isRerun = runAttempt > 1;

    const versionLabel = `app-${runNumber}${
      isRerun ? `.${runAttempt}` : ""
    }-${sha}`;

    const zipFileName = `${applicationName}/${versionLabel}.zip`;

    await uploadZipToS3({
      region,
      bucketName,
      zipFileName,
      filesToZip: files.map((file) => ({
        path: `${workingDirectory}/${file}`,
        name: file,
      })),
    });

    await createApplicationVersion({
      region,
      bucketName,
      zipFileName,
      applicationName,
      sha,
      versionLabel,
      commitMessage,
    });

    // Output the payload for debugging
    core.info(`The packageName: ${versionLabel}`);

    core.setOutput("version", versionLabel);
  } catch (error) {
    console.error(error);
    core.info(error.message);
    // Fail the workflow step if an error occurs
    core.setFailed(error.message);
  }
}
