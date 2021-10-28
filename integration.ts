/**
 * These integration tests depend on a running MinIO installation.
 *
 * See the README for instructions.
 */
import { readableStreamFromIterable } from "./deps.ts";
import { assert, assertEquals, assertRejects } from "./deps-tests.ts";
import { S3Client, S3Errors } from "./mod.ts";

const config = {
  endPoint: "localhost",
  port: 9000,
  useSSL: false,
  region: "dev-region",
  accessKey: "AKIA_DEV",
  secretKey: "secretkey",
  bucket: "dev-bucket",
  pathStyle: true,
};
const client = new S3Client(config);

Deno.test({
  name: "error parsing",
  fn: async () => {
    const unauthorizedClient = new S3Client({ ...config, secretKey: "invalid key" });
    await assertRejects(
      () => unauthorizedClient.putObject("test.txt", "This is the contents of the file."),
      (err: Error) => {
        assert(err instanceof S3Errors.ServerError);
        assertEquals(err.statusCode, 403);
        assertEquals(err.code, "SignatureDoesNotMatch");
        assertEquals(
          err.message,
          "The request signature we calculated does not match the signature you provided. Check your key and signing method.",
        );
        assertEquals(err.bucketName, config.bucket);
        assertEquals(err.region, config.region);
      },
    );
  },
});

Deno.test({
  name: "putObject() can upload a small file",
  fn: async () => {
    const response = await client.putObject("test.txt", "This is the contents of the file.");
    assertEquals(response.etag, "f6b64dbfb5d44e98363ff586e08f7fe6"); // The etag is generated by the server, based on the contents, so this confirms it worked.
  },
});

Deno.test({
  name: "putObject() can stream a large file upload",
  fn: async () => {
    // First generate a 32MiB file in memory, 1 MiB at a time, as a stream
    const dataStream = readableStreamFromIterable(async function* () {
      for (let i = 0; i < 32; i++) {
        await new Promise((r) => setTimeout(r, 10)); // Wait 10ms
        yield new Uint8Array(1024 * 1024).fill(0b01010101); // Yield 1MB of data (alternating ones and zeroes)
      }
    }());

    // Upload the 32MB stream data as 7 5MB parts. The client doesn't know in advance how big the stream is.
    const response = await client.putObject("test-32m.dat", dataStream, { partSize: 5 * 1024 * 1024 });
    // The etag is generated by the server, based on the contents. Also, etags for multi-part uploads are
    // different than for regular uploads, so the "-7" confirms it worked and used a multi-part upload.
    assertEquals(response.etag, "4581589392ae60eafdb031f441858c7a-7");
  },
});

Deno.test({
  name: "getObject() can download a small file",
  fn: async () => {
    const contents = "This is the contents of the file. 👻"; // Throw in an Emoji to ensure Unicode round-trip is working.
    await client.putObject("test-get.txt", contents);
    const response = await client.getObject("test-get.txt");
    assertEquals(await response.text(), contents);
  },
});

Deno.test({
  name: "getObject() can download a partial file",
  fn: async () => {
    await client.putObject("test-get2.txt", "This is the contents of the file. 👻");
    const response = await client.getPartialObject("test-get2.txt", { offset: 12, length: 8 });
    assertEquals(await response.text(), "contents");
  },
});
