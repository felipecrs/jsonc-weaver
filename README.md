# `@felipecrs/jsonc-weaver`

Modify JSONC files programmatically while preserving comments and formatting.

## Usage

Parse your JSONC with any parser, modify the object, then weave the changes
back.

**`original.jsonc`**:

```jsonc
{
  // Application settings
  "name": "my-app",
  "version": "1.0.0",
  /* Multi-line
     comment */
  "features": ["auth", "api"],
  "database": {
    "host": "localhost",
    "port": 5432 // Default port
  },
  "oldSetting": "remove-me"
}
```

**Code:**

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { parse, weave } from "@felipecrs/jsonc-weaver";

const original = await readFile("original.jsonc", "utf8");
const data = parse(original);

// Modify properties
data.name = "awesome-app";
data.version = "2.0.0";

// Change nested values
data.database.port = 3306;

// Modify arrays
data.features.push("logging");

// Remove properties
delete data.oldSetting;

// Add new properties
data.newSetting = "added";

const result = weave(original, data);

await writeFile("result.jsonc", result);
```

**`result.jsonc`**:

```jsonc
{
  // Application settings
  "name": "awesome-app",
  "version": "2.0.0",
  /* Multi-line
     comment */
  "features": ["auth", "api", "logging"],
  "database": {
    "host": "localhost",
    "port": 3306
  },
  "newSetting": "added"
}
```

> [!IMPORTANT]
> The order of properties in the modified object will determine their order in
> the output JSONC. Avoid reordering properties in your code to maintain the
> original order.

## Credits

This project is powered by
[@david/jsonc-morph](https://github.com/dsherret/jsonc-morph).
