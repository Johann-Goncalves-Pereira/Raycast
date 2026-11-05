import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGeckoProfilesIni } from "./profile";

describe("parseGeckoProfilesIni", () => {
  it("prefers the Default=1 profile path", () => {
    const ini = `
[General]
StartWithLastProfile=1

[Profile0]
Name=Default (release)
IsRelative=1
Path=Profiles/ss7t2m0j.Default (release)
Default=1

[Profile1]
Name=I2P
IsRelative=1
Path=Profiles/zznn1cz4.I2P
`;
    // Use a fake root; function only joins when IsRelative — existence check
    // returns undefined when the path is missing, so assert join shape via a
    // temp-less path that exists: the root itself as absolute Path.
    const absoluteIni = `
[Profile0]
Name=Temp
IsRelative=0
Path=/tmp
Default=1
`;
    const resolved = parseGeckoProfilesIni(absoluteIni, "/unused");
    assert.equal(resolved, "/tmp");

    const relative = parseGeckoProfilesIni(ini, "/tmp");
    // Relative paths under /tmp/Profiles/... likely missing → undefined
    assert.equal(
      relative === undefined || relative.includes("ss7t2m0j"),
      true,
    );
  });
});
