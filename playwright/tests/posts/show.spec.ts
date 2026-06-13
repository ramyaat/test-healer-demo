import { test, expect } from "@playwright/test";

test.describe("Show post", () => {
  let postId: number;

  test.beforeEach(async ({ page }) => {
    // Create a post via the form before each test
    await page.goto("/posts/new");
    await page.getByTestId("post-title-input").fill("Show Test Post");
    await page.getByTestId("post-body-input").fill("Body for show test.");
    await page.getByTestId("post-published-checkbox").check();
    await page.getByTestId("post-submit-button").click();
    await page.waitForURL(/\/posts\/\d+/);
    const match = page.url().match(/\/posts\/(\d+)/);
    postId = match ? parseInt(match[1]) : 0;
  });

  test("displays the post title and body", async ({ page }) => {
    await expect(page.getByTestId("post-title")).toHaveText("Show Test Post");
    await expect(page.getByTestId("post-body")).toHaveText(
      "Body for show test."
    );
  });

  test("displays published status correctly", async ({ page }) => {
    await expect(page.getByTestId("publication-status")).toHaveText("Published");
  });

  test("has edit and back links", async ({ page }) => {
    await expect(page.getByTestId("edit-post-link")).toBeVisible();
    await expect(page.getByTestId("back-to-posts")).toBeVisible();
  });
});
