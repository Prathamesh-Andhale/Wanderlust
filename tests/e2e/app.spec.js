const { test, expect } = require("@playwright/test");

test("listings page loads successfully", async ({ page }) => {
  await page.goto("/listings");
  await expect(page).toHaveURL(/\/listings/);
  await expect(page.getByRole("link", { name: /Explore/i })).toBeVisible();
  await expect(page.getByPlaceholder("Search listings...")).toBeVisible();
});

test("search page returns results view", async ({ page }) => {
  await page.goto("/listings");
  await page.getByPlaceholder("Search listings...").fill("Jaipur");
  await page.getByRole("button", { name: /Search/i }).click();
  await expect(page).toHaveURL(/\/listings\/search\?q=Jaipur/);
  await expect(page.getByRole("heading", { name: /Search Results/i })).toBeVisible();
});

test("new listing route redirects to login when unauthenticated", async ({
  page,
}) => {
  await page.goto("/listings/new");
  await expect(page).toHaveURL(/\/login|\/signup/);
  await expect(
    page.getByRole("heading", { name: /Login on Wanderlust/i })
  ).toBeVisible();
});
