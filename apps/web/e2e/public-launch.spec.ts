import { expect, test, type Page } from "@playwright/test";

const informationPages = [
  {
    path: "/guide",
    heading: "이용 안내",
    evidence: "업체 찾아보기",
  },
  {
    path: "/privacy",
    heading: "개인정보 처리방침",
    evidence: "공개 전 안내",
  },
  {
    path: "/advertising",
    heading: "광고 표시 정책",
    evidence: "현재 개발 단계에서는 광고·강화 상품을 노출하지 않습니다.",
  },
] as const;

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  expect(hasHorizontalOverflow).toBe(false);
}

test("홈에서 핵심 안내와 정책 페이지에 접근할 수 있다", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "민감한 내용을 남기지 않고, 확인된 업체 정보를 살펴보세요.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "업체 찾아보기" })).toHaveAttribute(
    "href",
    "/offices",
  );

  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "이용 안내" })).toHaveAttribute(
    "href",
    "/guide",
  );
  await expect(
    footer.getByRole("link", { name: "개인정보 처리방침" }),
  ).toHaveAttribute("href", "/privacy");
  await expect(
    footer.getByRole("link", { name: "광고 표시 정책" }),
  ).toHaveAttribute("href", "/advertising");
  const canonicalHref = await page
    .locator('link[rel="canonical"]')
    .getAttribute("href");
  expect(canonicalHref).toBeTruthy();
  expect(new URL(canonicalHref!).pathname).toBe("/");
  await expectNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
});

for (const informationPage of informationPages) {
  test(`${informationPage.heading} 페이지가 고유 canonical과 핵심 내용을 제공한다`, async ({
    page,
  }) => {
    const browserErrors = collectBrowserErrors(page);
    const response = await page.goto(informationPage.path, {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: informationPage.heading }),
    ).toBeVisible();
    await expect(page.getByText(informationPage.evidence, { exact: false }).first()).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${informationPage.path}$`),
    );
    await expectNoHorizontalOverflow(page);
    expect(browserErrors).toEqual([]);
  });
}

test("robots 정책은 공개 경로를 허용하고 내부 경로를 제외한다", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  const body = await response.text();

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(body).toContain("Allow: /");
  expect(body).toContain("Disallow: /admin");
  expect(body).toContain("Disallow: /api");
  expect(body).toContain("Disallow: /sign-in");
  expect(body).toContain("Sitemap:");
});

test("로그아웃 관리자는 로그인 후 원래 경로로 복귀하도록 리디렉션된다", async ({
  request,
}) => {
  const response = await request.get("/admin/reviews", { maxRedirects: 0 });
  const locationHeader = response.headers().location;

  expect(response.status()).toBe(307);
  expect(locationHeader).toBeTruthy();

  const location = new URL(locationHeader!, "http://localhost:3100");
  expect(location.pathname).toBe("/sign-in");
  expect(location.searchParams.get("redirect_url")).toContain("/admin/reviews");
});
