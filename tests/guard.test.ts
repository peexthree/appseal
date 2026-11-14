import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPublicFetchTarget, isForbiddenIp } from "../src/lib/scanner/guard.ts";

describe("guard: isForbiddenIp", () => {
  it("blocks private, loopback, link-local and reserved v4 ranges", () => {
    assert.equal(isForbiddenIp("10.1.2.3"), true);
    assert.equal(isForbiddenIp("172.16.0.1"), true);
    assert.equal(isForbiddenIp("172.31.255.255"), true); // last addr of /12
    assert.equal(isForbiddenIp("172.32.0.1"), false); // just outside /12
    assert.equal(isForbiddenIp("192.168.1.1"), true);
    assert.equal(isForbiddenIp("169.254.169.254"), true); // cloud metadata
    assert.equal(isForbiddenIp("100.64.0.1"), true); // CGNAT
    assert.equal(isForbiddenIp("0.0.0.0"), true);
    assert.equal(isForbiddenIp("240.0.0.1"), true); // reserved
    assert.equal(isForbiddenIp("8.8.8.8"), false);
    assert.equal(isForbiddenIp("1.2.3.4"), false);
  });

  it("blocks IPv6 loopback, ULA and link-local forms", () => {
    assert.equal(isForbiddenIp("::1"), true);
    assert.equal(isForbiddenIp("::"), true);
    assert.equal(isForbiddenIp("fc00::1"), true);
    assert.equal(isForbiddenIp("fd12::1"), true);
    assert.equal(isForbiddenIp("fe80::1"), true);
    assert.equal(isForbiddenIp("ff02::1"), true);
    assert.equal(isForbiddenIp("2001:db8::1"), false);
  });

  it("blocks IPv4-mapped IPv6, denies malformed", () => {
    assert.equal(isForbiddenIp("::ffff:10.0.0.1"), true);
    assert.equal(isForbiddenIp("::ffff:169.254.169.254"), true);
    assert.equal(isForbiddenIp("::ffff:8.8.8.8"), false);
    assert.equal(isForbiddenIp("999.1.2.3"), true); // malformed → deny
    assert.equal(isForbiddenIp("1.2.3"), true); // malformed → deny
  });
});

describe("guard: assertPublicFetchTarget (offline cases, no DNS)", () => {
  it("blocks non-http(s) schemes", async () => {
    await assert.rejects(() => assertPublicFetchTarget("file:///etc/passwd"), /only http\/https/);
    await assert.rejects(() => assertPublicFetchTarget("gopher://h/"), /only http\/https/);
  });

  it("blocks loopback and reserved-name hosts before any request", async () => {
    await assert.rejects(() => assertPublicFetchTarget("http://127.0.0.1:8080/"), /not a public/);
    await assert.rejects(() => assertPublicFetchTarget("http://localhost/x"), /not a public host/);
    await assert.rejects(() => assertPublicFetchTarget("http://api.internal/v1"), /not a public host/);
    await assert.rejects(() => assertPublicFetchTarget("http://srv.local/x"), /not a public host/);
  });

  it("allows public literal IPs without DNS", async () => {
    await assert.doesNotReject(() => assertPublicFetchTarget("http://1.2.3.4/x"));
    await assert.doesNotReject(() => assertPublicFetchTarget("https://93.184.216.34/"));
  });
});
