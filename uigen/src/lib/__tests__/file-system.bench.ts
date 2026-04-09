import { bench, describe } from "vitest";
import { VirtualFileSystem } from "@/lib/file-system";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFS(fileCount = 50): VirtualFileSystem {
  const fs = new VirtualFileSystem();
  for (let i = 0; i < fileCount; i++) {
    fs.createFile(
      `/src/components/Component${i}.tsx`,
      `export const Component${i} = () => <div>Component ${i}</div>;`
    );
  }
  return fs;
}

const LARGE_CONTENT = Array.from(
  { length: 1_000 },
  (_, i) => `const line${i} = "value ${i}"; // some comment here`
).join("\n");

// ── normalizePath (called on every FS operation) ──────────────────────────────

describe("normalizePath (via exists)", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/src/index.ts", "");

  bench("clean path – no work needed", () => {
    fs.exists("/src/index.ts");
  });

  bench("path without leading slash", () => {
    fs.exists("src/index.ts");
  });

  bench("path with repeated slashes", () => {
    fs.exists("//src//index.ts");
  });

  bench("path with trailing slash", () => {
    fs.exists("/src/index.ts/");
  });
});

// ── createFile ────────────────────────────────────────────────────────────────

describe("createFile", () => {
  bench("flat file", () => {
    const fs = new VirtualFileSystem();
    for (let i = 0; i < 100; i++) {
      fs.createFile(`/file${i}.ts`, "content");
    }
  });

  bench("deeply nested file (auto-create parents)", () => {
    const fs = new VirtualFileSystem();
    fs.createFile("/a/b/c/d/e/f/g/file.ts", "content");
  });

  bench("50 files across subdirs", () => {
    makeFS(50);
  });
});

// ── readFile ─────────────────────────────────────────────────────────────────

describe("readFile", () => {
  const fs = makeFS(100);

  bench("existing file", () => {
    fs.readFile("/src/components/Component50.tsx");
  });

  bench("non-existent file", () => {
    fs.readFile("/src/components/Missing.tsx");
  });
});

// ── replaceInFile ─────────────────────────────────────────────────────────────

describe("replaceInFile", () => {
  bench("few occurrences, small file", () => {
    const fs = new VirtualFileSystem();
    fs.createFile("/test.ts", "foo bar foo baz foo");
    fs.replaceInFile("/test.ts", "foo", "replaced");
  });

  bench("many occurrences, large file (~1000 lines)", () => {
    const fs = new VirtualFileSystem();
    // Replace "const" which appears once per line → 1000 occurrences
    fs.createFile("/large.ts", LARGE_CONTENT);
    fs.replaceInFile("/large.ts", "const", "let");
  });

  bench("single occurrence, large file", () => {
    const fs = new VirtualFileSystem();
    fs.createFile("/large.ts", LARGE_CONTENT);
    fs.replaceInFile("/large.ts", "line999", "lineX");
  });

  bench("repeated replace on same file (10×)", () => {
    const fs = new VirtualFileSystem();
    fs.createFile("/test.ts", "aaa bbb aaa bbb aaa");
    for (let i = 0; i < 10; i++) {
      fs.replaceInFile("/test.ts", "aaa", "xxx");
      fs.replaceInFile("/test.ts", "xxx", "aaa");
    }
  });
});

// ── viewFile ──────────────────────────────────────────────────────────────────

describe("viewFile", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/small.ts", "line1\nline2\nline3");
  fs.createFile("/large.ts", LARGE_CONTENT);

  bench("small file – full view", () => {
    fs.viewFile("/small.ts");
  });

  bench("large file – full view (~1000 lines)", () => {
    fs.viewFile("/large.ts");
  });

  bench("large file – small range [1, 10]", () => {
    fs.viewFile("/large.ts", [1, 10]);
  });

  bench("large file – end range [990, -1]", () => {
    fs.viewFile("/large.ts", [990, -1]);
  });
});

// ── serialize / deserialize ───────────────────────────────────────────────────

describe("serialize", () => {
  const fs50 = makeFS(50);
  const fs200 = makeFS(200);

  bench("50 files", () => {
    fs50.serialize();
  });

  bench("200 files", () => {
    fs200.serialize();
  });
});

describe("deserialize", () => {
  const fs50 = makeFS(50);
  const serialized50 = fs50.serialize() as Record<string, string>;

  const fs200 = makeFS(200);
  const serialized200 = fs200.serialize() as Record<string, string>;

  bench("50 files", () => {
    const fs = new VirtualFileSystem();
    fs.deserializeFromNodes(fs50.serialize());
  });

  bench("200 files", () => {
    const fs = new VirtualFileSystem();
    fs.deserializeFromNodes(fs200.serialize());
  });
});

// ── getAllFiles ───────────────────────────────────────────────────────────────

describe("getAllFiles", () => {
  const fs50 = makeFS(50);
  const fs200 = makeFS(200);

  bench("50 files", () => {
    fs50.getAllFiles();
  });

  bench("200 files", () => {
    fs200.getAllFiles();
  });
});

// ── rename ────────────────────────────────────────────────────────────────────

describe("rename", () => {
  bench("rename single file", () => {
    const fs = new VirtualFileSystem();
    fs.createFile("/src/old.ts", "content");
    fs.rename("/src/old.ts", "/src/new.ts");
  });

  bench("rename directory with 20 files", () => {
    const fs = new VirtualFileSystem();
    for (let i = 0; i < 20; i++) {
      fs.createFile(`/src/file${i}.ts`, "content");
    }
    fs.rename("/src", "/lib");
  });

  bench("rename directory with 100 files", () => {
    const fs = new VirtualFileSystem();
    for (let i = 0; i < 100; i++) {
      fs.createFile(`/src/file${i}.ts`, "content");
    }
    fs.rename("/src", "/lib");
  });
});
