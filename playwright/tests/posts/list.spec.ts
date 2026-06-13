import { test, expect } from "@playwright/test";

test.describe("Posts list page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows the posts heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Posts" })).toBeVisible();
  });

  test("shows the posts list container", async ({ page }) => {
    await expect(page.getByTestId("posts-list")).toBeVisible();
  });

  test("has a link to create a new post", async ({ page }) => {
    await expect(page.getByRole("link", { name: "+ New Post" })).toBeVisible();
    await expect(page.getByRole("link", { name: "+ New Post" })).toHaveText("+ New Post");
  });
});
