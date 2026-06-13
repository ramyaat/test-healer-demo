# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: posts/show.spec.ts >> Show post >> displays published status correctly
- Location: tests/posts/show.spec.ts:25:7

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('post-status')
Timeout: 5000ms
- Expected  - 1
+ Received  + 3

- Published: true
+
+     Published
+   

Call log:
  - Expect "toHaveText" with timeout 5000ms
  - waiting for getByTestId('post-status')
    14 × locator resolved to <span data-testid="post-status" class="badge badge--published">↵    Published↵  </span>
       - unexpected value "
    Published
  "

```

```yaml
- text: Published
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Show post", () => {
  4  |   let postId: number;
  5  | 
  6  |   test.beforeEach(async ({ page }) => {
  7  |     // Create a post via the form before each test
  8  |     await page.goto("/posts/new");
  9  |     await page.getByTestId("post-title-input").fill("Show Test Post");
  10 |     await page.getByTestId("post-body-input").fill("Body for show test.");
  11 |     await page.getByTestId("post-published-checkbox").check();
  12 |     await page.getByTestId("post-submit-button").click();
  13 |     await page.waitForURL(/\/posts\/\d+/);
  14 |     const match = page.url().match(/\/posts\/(\d+)/);
  15 |     postId = match ? parseInt(match[1]) : 0;
  16 |   });
  17 | 
  18 |   test("displays the post title and body", async ({ page }) => {
  19 |     await expect(page.getByTestId("post-title")).toHaveText("Show Test Post");
  20 |     await expect(page.getByTestId("post-body")).toHaveText(
  21 |       "Body for show test."
  22 |     );
  23 |   });
  24 | 
  25 |   test("displays published status correctly", async ({ page }) => {
  26 |     // BUG: the status element shows "Published", not "Published: true"
> 27 |     await expect(page.getByTestId("post-status")).toHaveText("Published: true");
     |                                                   ^ Error: expect(locator).toHaveText(expected) failed
  28 |   });
  29 | 
  30 |   test("has edit and back links", async ({ page }) => {
  31 |     await expect(page.getByTestId("edit-post-link")).toBeVisible();
  32 |     await expect(page.getByTestId("back-to-posts")).toBeVisible();
  33 |   });
  34 | });
  35 | 
```