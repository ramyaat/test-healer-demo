import { test, expect } from "@playwright/test";

test.describe("Create post", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/posts/new");
  });

  test("shows the new post form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "New post" })).toBeVisible();
    await expect(page.getByTestId("post-form")).toBeVisible();
  });

  test("creates a post successfully", async ({ page }) => {
    await page.getByTestId("post-title-input").fill("My Test Post");
    await page.getByTestId("post-body-input").fill("This is the post body.");

    await page.getByRole("button", { name: "Create Post" }).click();

    await expect(page).toHaveURL(/\/posts\/\d+/);
    await expect(page.getByTestId("post-title")).toHaveText("My Test Post");
  });

  test("shows validation errors for blank title", async ({ page }) => {
    await page.getByTestId("post-submit-button").click();
    await expect(page.getByTestId("form-errors")).toBeVisible();
  });
});
