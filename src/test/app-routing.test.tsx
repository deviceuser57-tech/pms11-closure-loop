import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";

async function loadAt(path: string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App routing", () => {
  it("loads the index route without mounting the document shell into a test div", async () => {
    const router = await loadAt("/");
    expect(router.state.location.pathname).toBe("/");
  });

  it("loads the not-found route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const router = await loadAt("/this-route-does-not-exist");
    expect(router.state.location.pathname).toBe("/this-route-does-not-exist");
  });
});
