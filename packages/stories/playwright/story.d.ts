import { expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"
export { expect }
/**
 * Glide the mouse to the element the way a person moves it. Tooltips only open for a pointer that was moving:
 * a jump (a plain `hover()`) reads as a screen reader placing the pointer and never opens them.
 */
export declare function hoverWithGlide(page: Page, target: Locator, steps?: number): Promise<void>
/**
 * The dev server URL of a source module, in the form Vite rewrites imports to. A different spelling, such as
 * `/@fs//Users/...`, loads a second instance of the module, whose contexts the rest of the page never provides.
 */
export declare const sourceURL: (url: URL) => string
export declare const story: import("@playwright/test").TestType<
  import("@playwright/test").PlaywrightTestArgs &
    import("@playwright/test").PlaywrightTestOptions & {
      mount: (
        id: string,
        options?:
          | {
              args?: Record<string, string | boolean> | undefined
              globals?: Record<string, string> | undefined
            }
          | undefined,
      ) => Promise<Locator>
    },
  import("@playwright/test").PlaywrightWorkerArgs & import("@playwright/test").PlaywrightWorkerOptions
>
