# Configurable Catalogue Workstream

## Authority and objective

This is the approved implementation plan for the 28 July 2026
`GreekYogurtOrderApp` feature workstream. It is subordinate to the current user
instruction and `AGENTS.md`.

The objective is a QA-passed, isolated-UAT-verified, release-ready
implementation of:

- Staff topping management;
- minimal configurable option groups;
- product-image upload, removal, and display;
- a direct Queue-card `พร้อมส่ง` action; and
- an accessible bottom basket for Customer ordering, with the low-risk
  equivalent on Staff ordering.

The optional member-code field is **deferred**. It must not be started until all
mandatory work has passed QA and isolated UAT.

No step in this plan authorizes a merge to `main`, a Production deployment, a
Production migration, a Production Rules deployment, a Production Storage
deployment, a Production data write, a billing change, or a change to Draft PR
#14.

## Verified baseline

Verified on 28 July 2026 in `Asia/Bangkok`:

| Item                          | Verified state                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Repository                    | `josurapatt/Greek-Yogert`                                                                                                     |
| Planning base                 | `origin/main`                                                                                                                 |
| Exact base SHA                | `6e28459fc1ecafb9eca33360a2f2e6d7b68694a5`                                                                                    |
| Local `main` vs `origin/main` | `0` ahead / `0` behind                                                                                                        |
| Main worktree                 | `C:\Users\surapat.c\Desktop\GreekYogurtOrderApp-pr13-merge`                                                                   |
| Main worktree state           | Clean                                                                                                                         |
| Planning branch               | `feature/configurable-catalogue-workstream-plan`                                                                              |
| Planning worktree             | `C:\Users\surapat.c\Documents\Our Shop\GreekYogurtOrderApp-configurable-catalogue-plan`                                       |
| Existing UI worktree          | `C:\Users\surapat.c\Desktop\GreekYogurtOrderApp`                                                                              |
| Existing UI branch            | `feature/light-purple-ui-refresh`, clean, `0/0` against its remote                                                            |
| Open PRs                      | Only PR #14                                                                                                                   |
| PR #14                        | Open Draft, head `b36f8a88728115228f8363b4ab7185e1e1ace1a8`, no reviews, currently reported unmergeable; paused and untouched |
| Current application baseline  | 363 tests passed across 37 files                                                                                              |
| Production                    | Customer QR is live; no Production action occurred during planning                                                            |

`CURRENT_STATUS.md` and `ROADMAP.md` on `main` confirm the completed Customer QR
Production rollout. Earlier status text on the paused PR #14 branch is stale and
must not be used as the feature baseline.

## Current architecture findings

- `src/types.ts` has one `Product` model with legacy `optionMode` values
  `none`, `granola`, and `toppings`. `CartItem` already stores immutable
  selected IDs, selected display labels, price breakdown, unit price, and line
  total.
- `src/data.ts` contains the 14 static topping IDs, granola compatibility map,
  default products, channel rules, and additive `normalizeProduct` fallback.
- `src/lib.ts` is the shared pricing, validation, availability, cart repricing,
  and order-snapshot authority for Staff and Customer flows.
- `src/components/ProductModal.tsx` is already shared by Staff and Customer and
  is therefore the smallest integration seam for configurable groups.
- `src/store.tsx` owns Staff products, the private
  `settings/toppingAvailability` map, carts, order status changes, and atomic
  public projection updates.
- `src/publicProjection.ts` and `scripts/projectPublicData.ts` provide the
  deterministic public projection and dry-run/apply boundary.
- `src/trustedCustomerConfirmation.ts` rebuilds Customer requests from current
  private configuration inside the Staff confirmation transaction and rejects
  any snapshot or price mismatch.
- Historical orders, reports, and Excel export read `CartItem` snapshots rather
  than current catalogue labels. Preserving the existing flat
  `selectedOptionIds` and `selectedOptions` arrays therefore avoids a report or
  historical-order rewrite.
- Queue detail already uses `setOrderStatus(id, "completed")` through
  `src/orderActions.ts`. Queue cards currently contain a single wrapping link.
- Customer ordering already contains the full editable basket at the end of
  `CustomerOrderPage`; it lacks only an always-accessible bottom summary.
- Staff ordering has the same shared cart context, known quantity/total, and a
  `/cart` route, so a Staff bottom-cart bar is a low-risk additive change.
- Firebase Web config already contains a Storage bucket value, but the app does
  not initialize Firebase Storage. No `storage.rules`, Storage emulator test,
  Storage entry in Firebase config, or Storage deployment scope exists.

## Approved architecture

### 1. Thin configurable catalogue

Add a private Staff catalogue collection:

```text
optionGroups/{groupId}
```

and an anonymous-safe public projection:

```text
publicOptionGroups/{groupId}
```

Use this bounded model:

```ts
interface OptionChoice {
  id: string; // stable and globally unique across groups
  name: string;
  active: boolean; // definition lifecycle
  displayOrder: number;
  classification: "normal" | "premium";
  surcharge: number; // generic group surcharge; zero by default
  availabilityId?: string; // compatibility key in the existing availability map
  everUsed: boolean; // irreversible safe-deletion guard
}

interface OptionGroup {
  id: string;
  displayName: string;
  active: boolean;
  displayOrder: number;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  allowDuplicates: boolean;
  pricingMode: "legacy-topping" | "choice-surcharge";
  choices: OptionChoice[];
}

interface ProductOptionGroupAssignment {
  groupId: string;
  choiceIds?: string[]; // omitted means all active group choices
  required?: boolean; // optional product override
  minSelections?: number; // optional product override
  maxSelections?: number; // optional product override
}
```

Add only these optional Product fields:

```ts
optionGroupAssignments?: ProductOptionGroupAssignment[];
imagePath?: string;
imageUrl?: string;
```

Do not remove or bulk-rewrite the legacy Product fields. They remain the
compatibility source when configurable assignments are absent.

The current static values become deterministic fallback definitions:

- `toppings` retains every current topping ID exactly;
- `granola-flavour` retains the current granola selected values as stable IDs
  and maps them to the existing `granola-*` availability keys; and
- products with no `optionGroupAssignments` are adapted from `optionMode`,
  `includedToppings`, `maxSelectedOptions`, `granolaOptions`, and
  `availableToppingIds` at read time.

If an `optionGroups/{id}` document exists, it is authoritative for that complete
group. Missing group documents use the committed fallback. Missing choices are
not silently reinserted into an existing authoritative group.

### 2. Pricing and selection compatibility

- Keep `ChannelToppingRules` and the existing LINE MAN / Grab restrictions.
- `pricingMode: "legacy-topping"` uses the existing included-count,
  premium-included, extra-normal, extra-premium, and channel restriction logic.
- `pricingMode: "choice-surcharge"` adds each selected choice surcharge to the
  existing `extraToppingCharges` price-breakdown field. Do not add a universal
  rules or pricing engine.
- The topping catalogue classification is authoritative when present.
  `premiumToppingIds` remains a fallback for legacy Product documents.
- Effective group limits are group defaults plus narrow Product assignment
  overrides. The sum of effective maxima for a Customer product must remain
  within the existing ten-selection abuse limit.
- Group duplicate rules apply to ordinary configurable groups. The existing
  channel topping rule remains the override for the `toppings` group.
- The private and public availability maps remain the canonical sale-availability
  store. `availabilityId ?? id` is the lookup key. Missing keys remain available.

### 3. Snapshot and historical-order boundary

Keep the existing `CartItem` shape and Customer request schema version:

- `selectedOptionIds` remains a flat ordered list of stable choice IDs;
- `selectedOptions` remains the immutable display-label snapshot;
- existing topping and granola labels remain byte-compatible;
- future generic labels use `Group name: Choice name` so the group context is
  retained without replacing the Cart model; and
- accepted `priceBreakdown`, `unitPrice`, and `lineTotal` remain snapshots.

Confirmed orders are never repriced or reinterpreted. Current carts and pending
Customer requests are revalidated through the existing shared pricing and
trusted-confirmation path.

### 4. Projection and security boundary

Advance the public catalogue projection to schema V3 while preserving the
legacy public Product fields. The V3 fingerprint covers:

- public products, including assignments and image metadata;
- projected active option groups and choices;
- availability;
- per-product total and per-group selection policy; and
- the existing operational control inputs.

New Rules must read legacy V2 and V3 data but must not allow a V3 control/policy
to be downgraded to V2. Existing products remain orderable before any Product
assignment write. New products that rely only on configurable assignments must
not be activated until the V3 Hosting client is released.

Firestore Rules remain explicit:

- private `optionGroups` are Staff-only;
- public groups are readable only by anonymous customers or authorized Staff,
  with bounded list limits;
- only authorized Staff may write validated private/public catalogue data;
- Customer request fields remain bounded; and
- trusted Staff confirmation continues to reconstruct exact labels, limits,
  availability, and price from private Product and catalogue documents before
  creating an Order.

### 5. Topping lifecycle and deletion

`active` and sale availability are separate:

- disabling a definition hides it from new selection and assignment while
  preserving its ID;
- sale availability marks an active choice sold out without archiving it;
- re-enable restores the same ID;
- an existing or `everUsed` choice is archived, never physically deleted; and
- permanent deletion is permitted only for a new `everUsed == false` choice
  that is unassigned to every Product and absent from every channel rule.

The first valid Product assignment irreversibly sets `everUsed` to true.
Historical and confirmed snapshots are never queried, rewritten, or deleted by
catalogue removal.

### 6. Product images

Firebase Storage is required. Firestore blobs/data URLs and a new third-party
media backend are rejected because they either violate document-size and cost
boundaries or expand the platform.

Use only:

```text
product-images/{productId}/{uuid}.{ext}
```

with JPEG, PNG, and WebP accepted, maximum size 5 MiB. Upload replacement uses
a new unique object, updates Product plus projection, and then removes the prior
object. Failed Product/projection writes clean up the new object. Removal clears
the Product/projection reference and deletes the exact prior object; broken
references render the fallback.

Storage Rules:

- permit read only to an authorized Staff user or an authenticated customer
  where `publicMenu/{productId}.imagePath` exactly matches the requested object;
- permit create/update/delete only to explicit active Staff resolved through
  the existing `users/{uid}` Firestore authorization document;
- validate path, 5 MiB size, and exact MIME allowlist on writes; and
- deny every other path.

The display fallback is:

1. uploaded image;
2. non-empty existing Emoji;
3. neutral bowl placeholder.

A shared `ProductVisual` component handles load failure and is used in product
management, Staff ordering, Customer ordering, and the shared Product modal.
Topping or choice images are excluded.

### 7. Queue and bottom basket

Queue cards receive a callback from `QueuePage` and call the existing
`setOrderStatus(order.id, "completed")` authority. Each card owns busy/error
state, stops event propagation on the action, disables duplicate clicks, and
renders the action only for `pending` orders. The remaining card content stays
a detail link.

Customer ordering keeps its full basket in place. A fixed bottom summary appears
only when the basket is non-empty, displays unit count and current total, and
scrolls/focuses the user to the full basket. CSS adds page bottom padding,
`env(safe-area-inset-bottom)`, responsive wrapping, and overflow protection.
The bar must not cover validation or submit controls.

**Staff-cart decision: implement.** `OrderPage` already has the shared cart
items, channel, totals, and `/cart` route. The same bottom summary can be added
without changing cart ownership or checkout. It is excluded from the Staff
`CartPage` itself so it cannot cover checkout controls.

## External blocker: Firebase Storage billing and service permission

The isolated UAT project is documented as Spark. Firebase's current policy says
Cloud Storage requires Blaze from 3 February 2026; a Spark project loses
read/write access even to an existing default bucket. The repository also
prohibits enabling billing without explicit approval.

Storage Rules that consult Firestore for the existing explicit Staff role also
require the Firebase Rules service permission connecting Storage Rules to
Firestore. That project-level permission must be enabled separately and is not
authorized by this plan.

Therefore:

- local implementation and Storage Emulator tests are allowed;
- no UAT or Production bucket, billing, IAM, Rules, or object change is allowed
  yet;
- WP-CC-02 cannot receive final image-UAT acceptance, and WP-CC-05 cannot reach
  release-ready status, until the user either approves Blaze plus the required
  isolated-UAT Rules service permission or supplies a separate approved
  Blaze-enabled isolated UAT project; and
- no Production Storage or billing decision is implied by an isolated-UAT
  decision.

Official references:

- <https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024>
- <https://firebase.google.com/docs/storage/security/rules-conditions>
- <https://firebase.google.com/docs/emulator-suite/connect_storage>

## Work Package sequence

Repository governance requires each implementation package to use a fresh
branch and Draft PR, starting from the accepted merged predecessor.

### WP-CC-01 — Configurable catalogue and compatibility foundation

**Exact objective**

Create the additive catalogue, selection, pricing, projection, security, and
dry-run migration foundation without changing visible ordering or management
workflows.

**Included scope**

- Add the bounded types and deterministic `toppings` / `granola-flavour`
  fallback catalogue.
- Add legacy Product-to-assignment adapters and normalizers.
- Add effective-group, allowed-choice, label, availability, duplicate, limit,
  and price helpers.
- Keep existing LINE MAN / Grab restrictions and premium pricing.
- Add private/public option-group subscriptions and repositories with bounded
  reads.
- Advance public projection and policy to V3 with V2 read compatibility and
  downgrade prevention.
- Extend trusted confirmation to rebuild against the private catalogue while
  accepting legacy requests.
- Add Firestore Rules for private/public groups and V2/V3 policy compatibility.
- Add a deterministic, idempotent, reviewable, dry-run-default catalogue
  migration/projection mode. Do not run it against Production.

**Explicit exclusions**

- No Staff CRUD UI.
- No configurable ordering UI.
- No product-image code or Storage Rules.
- No Queue or basket change.
- No Product, Order, request, history, or report migration.
- No Firebase deployment or remote data write.

**Expected files or modules**

- `src/types.ts`
- `src/data.ts`
- new `src/optionCatalogue.ts`
- `src/lib.ts`
- `src/customerRequestPolicy.ts`
- `src/customerOrder.ts`
- `src/publicProjection.ts`
- `src/trustedCustomerConfirmation.ts`
- `src/store.tsx`
- `src/customerFirebase.tsx`
- `firestore.production.rules`
- `firestore.production.test.ts`
- `scripts/projectPublicData.ts`
- `scripts/runPublicProjection.mjs`
- focused existing/new tests only

**Data-model changes**

Add `OptionGroup`, `OptionChoice`, `ProductOptionGroupAssignment`, optional
`Product.optionGroupAssignments`, private `optionGroups`, public
`publicOptionGroups`, and Projection V3 policy fields. Customer request and
Order schema remain unchanged.

**Security impact**

New private/public Firestore namespaces and V3 validation. Anonymous users may
read only bounded projected groups. They cannot read or mutate private groups.
Customer payload bounds and trusted confirmation must be no weaker than V2.

**Migration or compatibility method**

Read-time adapters keep missing group documents and legacy Products valid. The
migration tool is dry-run by default, writes only additive catalogue/projection
documents when explicitly applied to an approved non-Production target, records
a deterministic fingerprint, and is repeatable with zero second-run writes.

**Required implementation tests**

- Every current static topping ID is preserved.
- Legacy `none`, `granola`, and `toppings` Products normalize correctly.
- Legacy missing fields keep current defaults.
- Required/optional groups, min/max overrides, duplicate rules, disabled groups,
  disabled/unavailable choices, and stable ordering.
- Generic surcharge and legacy topping pricing.
- Storefront/Openchat and LINE MAN/Grab restrictions and premium prices.
- Flat Cart snapshot labels and accepted totals remain unchanged for all current
  default products.
- Projection V2 read compatibility, V3 deterministic fingerprint, idempotency,
  and downgrade rejection.
- Trusted confirmation accepts canonical legacy/V3 requests and rejects stale,
  unknown, disabled, unavailable, mislabelled, or mispriced choices.
- Firestore Rules allow/deny matrix for private/public groups and V2/V3 policy.

**Required QA tests**

- Independent focused diff and scope review.
- Run all affected tests plus the full application suite.
- Run all canonical Firestore Emulator tests.
- Run lint, TypeScript Production build, formatting check, Rules syntax,
  dry-run twice, and changed-file secret scan.
- Verify no Firebase project, Production data, or PR #14 was accessed or changed.

**Acceptance criteria**

- Current products produce the exact same selections and totals as baseline.
- Configurable group helpers support all required fields without a generic rules
  engine.
- Existing Customer requests, trusted confirmation, and historical Order
  snapshots remain readable and unchanged.
- Projection V3 is deterministic, V2-compatible for reads, and cannot downgrade.
- All required tests pass with independent QA `PASS` or accepted
  `PASS_WITH_NOTES`.

**Completion evidence**

- Exact starting/ending SHA and Draft PR.
- File list and focused diff.
- Test counts and exact commands.
- Projection dry-run fingerprints and zero-write repeat result.
- Rules test result and explicit no-deployment statement.

**Dependencies**

None beyond the accepted plan commit and exact baseline.

**Rollback or disable path**

Do not apply any migration. With no catalogue documents or assignments, the
legacy adapter remains authoritative. Revert the WP commit before any later data
write. No historical rollback is needed.

### WP-CC-02 — Staff catalogue management and product images

**Exact objective**

Add focused Staff management for groups, toppings, assignments, availability,
and secure product images on top of WP-CC-01.

**Included scope**

- Add/edit/disable/re-enable groups and choices.
- Edit topping display name, classification, surcharge, display order, and sale
  availability.
- Assign groups and allowed choices to Products with limit overrides.
- Implement archive/disable removal for groups and choices. Physical deletion
  is unsupported and denied by Firestore Rules.
- Keep stable IDs immutable after creation.
- Add product image upload, replacement, removal, management preview, fallback,
  client validation, Firebase Storage initialization, and exact object cleanup.
- Add `storage.rules`, Storage emulator config/tests, and guarded isolated-UAT
  deployment configuration without running it.
- Preserve atomic Product, catalogue, availability, and public projection
  synchronization.

**Explicit exclusions**

- No topping/choice images.
- No media library, cropper, image transformation, or external CDN.
- No ordering-screen generic group renderer yet.
- No Queue or basket change.
- No billing, IAM, UAT Storage, Production Storage, or deployment action.

**Expected files or modules**

- `src/pages/ProductsPage.tsx`
- new focused components such as `src/components/OptionGroupManager.tsx`,
  `src/components/ProductImageField.tsx`, and `src/components/ProductVisual.tsx`
- `src/store.tsx`
- `src/firebase.ts`
- new `src/productImages.ts`
- `src/types.ts`
- `src/publicProjection.ts`
- `firestore.production.rules`
- new `storage.rules` and Storage Rules test/config files
- `firebase.json`
- `firebase.customer-uat.json`
- `.github/workflows/deploy-customer-qr-uat.yml` only if needed for an explicit
  future UAT-only Storage deploy gate
- focused tests and required styles

**Data-model changes**

Persist private option-group metadata at `optionGroups/{groupId}` and each
private Choice at `optionGroups/{groupId}/choices/{choiceId}`. The Choice path
is its immutable identity; documents do not duplicate the ID. Preserve
irreversible `everUsed`, public denormalized option groups, Product assignments,
`imagePath`, and `imageUrl`. Continue using the existing availability maps.

**Security impact**

Storage introduces a new security surface. Only explicit active Staff can
mutate the allowlisted product-image path. Customer reads require authentication
and an exact published Product path. MIME and size checks exist in client and
Rules. Every non-product path is denied.

**Migration or compatibility method**

Existing groups are provided by fallback until explicitly persisted. Explicit
legacy embedded private groups remain read-compatible, but canonical writes use
only group metadata plus Choice documents. Existing Products without image
fields remain valid. Existing Emoji remains unchanged. Archive is the only
supported removal mechanism.

**Required implementation tests**

- Add/edit/disable/re-enable/archive behavior and direct-delete denial for
  groups and choices.
- Stable-ID immutability and duplicate-ID rejection.
- Global classification and price changes feed the existing pricing helper.
- Product assignment and `everUsed` transition.
- Availability writes remain atomic with public projection.
- Upload accepts JPEG/PNG/WebP at or below 5 MiB and rejects all other type/size
  cases before upload.
- Replace success, Product/projection failure cleanup, remove success, delete
  failure, stale path, and broken URL fallback.
- Storage Rules: unauthenticated, anonymous write, unauthorized Email/Password
  write, inactive Staff write, wrong path, oversized file, wrong MIME, arbitrary
  read denied; authorized Staff mutation and authenticated published-image read
  allowed.

**Required QA tests**

- Independent CRUD, deletion, security, and compensation-path review.
- Focused component/service tests.
- Firestore and Storage Emulator Rules suites.
- Full application suite, lint, TypeScript build, formatting, config/workflow
  parsing, bundle check, and secret scan.
- Local/demo-safe visual review of Products management and all fallbacks.

**Acceptance criteria**

- Every required topping operation works without changing historical snapshots.
- Product assignments and availability are atomic and projected.
- Product management can upload, replace, and remove a validated image.
- Broken/missing images always fall back.
- No unauthorized mutation or arbitrary object read is possible.
- Local and emulator QA passes.
- Final image-UAT acceptance remains blocked until the external Storage gate is
  explicitly resolved.

**Completion evidence**

- Exact SHA/PR/file list.
- CRUD test matrix.
- Firestore and Storage Rules test counts.
- Image compensation-path results.
- Explicit statement that no remote bucket, billing, IAM, Rules, data, or
  Production action occurred.

**Dependencies**

WP-CC-01 approved and merged. User resolution of the external Storage gate is
required for remote UAT, but not for local implementation and emulator review.

**Rollback or disable path**

Do not deploy Storage config. Revert the application commit. Existing Products
ignore absent image fields and fall back to Emoji. Archive catalogue definitions
rather than delete after use.

### WP-CC-03 — Staff and Customer ordering integration

**Exact objective**

Use the shared configurable catalogue in Staff and Customer product selection,
cart revalidation, Customer projection, submission, and trusted confirmation
while preserving current channel behaviour and snapshots.

**Included scope**

- Replace hard-coded modal branches with a bounded group renderer backed by the
  compatibility adapter.
- Render multiple ordered groups, required/optional state, min/max, duplicates,
  sold-out/disabled choices, and generic surcharge.
- Keep topping-specific included/extra and LINE MAN/Grab presentation where
  required; do not generalize it beyond the existing pricing rules.
- Feed private groups to Staff cart/order paths and public groups to Customer
  paths.
- Revalidate stale cart selections and Customer requests.
- Display `ProductVisual` on Staff and Customer product cards and shared modal.
- Preserve flat Cart/request/Order snapshots and report/export inputs.

**Explicit exclusions**

- No Staff catalogue CRUD changes beyond integration fixes.
- No Queue quick action or bottom basket.
- No report redesign.
- No loyalty/member field.
- No Production migration or deployment.

**Expected files or modules**

- `src/components/ProductModal.tsx`
- `src/pages/OrderPage.tsx`
- `src/pages/CartPage.tsx`
- `src/pages/CustomerOrderPage.tsx`
- `src/customerFirebase.tsx`
- `src/customerOrder.ts`
- `src/customerRequestPolicy.ts`
- `src/trustedCustomerConfirmation.ts`
- `src/lib.ts`
- `src/store.tsx`
- `src/components/ProductVisual.tsx`
- `src/publicProjection.ts`
- focused existing/new Staff, Customer, projection, confirmation, report, and
  export tests

**Data-model changes**

No additional persistent model beyond WP-CC-01/02. Cart and request schema stay
unchanged.

**Security impact**

Anonymous customers consume only projected groups. Submission remains bounded.
Trusted Staff confirmation must use current private groups and availability,
rejecting stale or tampered snapshots before atomic Order creation.

**Migration or compatibility method**

Legacy Products and carts use the adapter. Existing request and Order snapshots
render from stored labels/prices. V3 data is additive. No historical write.

**Required implementation tests**

- Staff and Customer legacy product parity.
- Multiple groups, order, required/optional limits, duplicates, availability,
  surcharges, product choice subsets, and stale selection rejection.
- Premium included/extra pricing and LINE MAN/Grab restriction regressions.
- Cart edit/remove/quantity/duplicate and channel reprice.
- Public projection to Customer conversion.
- Real Customer UI request builder to trusted Staff confirmation.
- Exact labels/prices preserved into confirmed Order.
- Historical and legacy snapshots, Reports, and Excel compatibility.
- Product image, Emoji, neutral fallback, and broken URL in both ordering UIs.

**Required QA tests**

- Independent responsive Staff and Customer behavioural review.
- Focused and full tests, Firestore Emulator tests, lint, build, formatting,
  secret scan, and focused diff.
- Browser rehearsal at desktop, tablet, and mobile widths with no horizontal
  overflow.

**Acceptance criteria**

- All current products order exactly as before.
- A test Product can use multiple configurable groups in both Staff and Customer
  flows.
- Trusted confirmation rejects stale/tampered choices and accepts the exact
  canonical UI request.
- Images and fallback render on all required ordering surfaces.
- Reports and export still consume immutable flat snapshots.
- Independent QA passes.

**Completion evidence**

- Exact SHA/PR/file list.
- Legacy parity fixture results.
- Customer UI-to-Staff confirmation evidence.
- Responsive screenshots or browser assertions.
- Report/export regression result and no-deployment statement.

**Dependencies**

WP-CC-02 approved and merged. Remote image checks remain conditional on the
external Storage gate.

**Rollback or disable path**

Remove configurable assignments from affected Products to invoke the legacy
adapter. Deactivate new groups/choices. Existing Products and Emoji remain
operable. Revert Hosting candidate before release.

### WP-CC-04 — Queue quick action and bottom baskets

**Exact objective**

Add the direct Queue-card ready action and non-obscuring bottom basket summaries
without changing order transitions or cart ownership.

**Included scope**

- Queue-card `พร้อมส่ง` for pending orders only.
- Existing `setOrderStatus` transition path.
- Per-card busy state, duplicate-click guard, error state, propagation
  prevention, and real-time reconciliation.
- Customer bottom basket count, total, open/full-basket action, safe area,
  bottom padding, and overflow protection.
- Equivalent Staff `OrderPage` bottom cart count, total, and `/cart` link.

**Explicit exclusions**

- No new order status.
- No alternate status service or transaction.
- No Queue/History redesign.
- No Staff CartPage overlay.
- No change to cart edit/remove/quantity or Customer submit logic.

**Expected files or modules**

- `src/components/QueueOrderCard.tsx`
- `src/pages/QueuePage.tsx`
- `src/orderActions.ts` only if a small shared non-navigation helper is required
- `src/pages/CustomerOrderPage.tsx`
- `src/pages/OrderPage.tsx`
- `src/styles.css`
- `src/customer.css`
- focused Staff/Customer UI tests

**Data-model changes**

None.

**Security impact**

No new permission. The action remains behind the Staff application and existing
Firestore Staff authorization.

**Migration or compatibility method**

None. Realtime pending-order and cart state are reused.

**Required implementation tests**

- Pending card shows action; completed/cancelled card does not.
- One save for repeated/double clicks; disabled while saving.
- Success calls the existing completed transition and reconciles Queue/History.
- Failure remains on Queue and displays a clear error.
- Action does not navigate; the rest of the card opens details.
- Customer bar appears after first item, shows quantity/total, opens/focuses full
  basket, and disappears when empty.
- Staff bar appears only on Staff ordering with non-empty cart and links to
  `/cart`.
- Edit/remove/quantity controls and submit remain operable.
- Mobile safe area, sufficient final spacing, no covered validation/submit, and
  no horizontal overflow.

**Required QA tests**

- Independent code and accessibility review.
- Focused tests plus full application suite, lint, build, and formatting.
- Browser checks at 390x844, 768x1024, and 1440x1000.
- Realtime Queue-to-History and error-path rehearsal in local/emulated data.

**Acceptance criteria**

- Eligible Staff can complete an order from its card exactly once.
- Detail navigation remains available outside the action.
- Customer and Staff ordering retain an accessible cart summary without
  obscuring content.
- Empty behaviour remains clear and all regressions pass.

**Completion evidence**

- Exact SHA/PR/file list.
- Duplicate-click call count.
- Queue/History reconciliation evidence.
- Responsive geometry assertions/screenshots and no-overflow result.
- No-deployment statement.

**Dependencies**

WP-CC-03 approved and merged.

**Rollback or disable path**

Remove the card action and fixed summaries. Existing detail-page transition,
full baskets, header cart links, and realtime subscriptions remain intact.

### WP-CC-05 — Full regression, isolated UAT, and release readiness

**Exact objective**

Validate the exact integrated head, perform only approved isolated-UAT actions,
and produce release-ready evidence without merging or touching Production.

**Included scope**

- Exact-head focused and full automated regression.
- Firestore and Storage Emulator suites.
- Deterministic catalogue/projection dry-run, reviewed isolated-UAT apply, and
  second zero-write dry-run.
- Isolated-UAT-only Rules/Hosting/Storage deployment only after exact target,
  credential-project, billing, and service-permission approval.
- Staff functional UAT, Customer functional UAT, responsive UAT, real Customer
  UI-to-Staff confirmation, Queue/History, Reports, Excel, image upload/replace/
  remove, cleanup, and rollback rehearsal.
- Exact final SHA, QA verdict, limitations, release instructions, and rollback.

**Explicit exclusions**

- No merge to `main`.
- No Production migration, Rules, Storage, Hosting, Authentication, IAM,
  billing, product, topping, or order action.
- No PR #14 change.
- No member code.

**Expected files or modules**

- Focused test/harness updates only where evidence gaps exist
- `docs/CONFIGURABLE_CATALOGUE_WORKSTREAM.md`
- `CURRENT_STATUS.md`
- UAT runbook/workflow changes only when required for the approved isolated
  target and exact deployment scope

**Data-model changes**

No new model. Isolated UAT receives only synthetic catalogue, Product, image,
Customer request, and Order fixtures. No Production data is copied.

**Security impact**

This is the final authorization and target-identity gate. Storage and Firestore
Rules must be tested before any isolated deployment. Cleanup targets exact
synthetic IDs only.

**Migration or compatibility method**

Dry run first, review fingerprint/diff, explicitly apply only to approved UAT,
rerun to zero planned writes, and rehearse rollback. Never execute the
Production path.

**Required implementation tests**

- Full application suite.
- Full canonical Firestore and Storage Rules suites.
- Lint, TypeScript, Production-disabled build, UAT build, formatting,
  workflow/config parsing, secret scan, bundle inspection, and focused diff.
- All mandatory feature matrices from WP-CC-01 through WP-CC-04.

**Required QA tests**

- Exact-head independent QA.
- Staff CRUD, assignment, availability, image, ordering/cart, and Queue action.
- Customer public projection, configurable selection, bottom basket, request,
  status, and trusted confirmation.
- Legacy Products, carts, requests, confirmed Orders, History, Reports, and
  Excel.
- Responsive desktop/tablet/mobile and safe-area checks.
- UAT cleanup and rollback verification.

**Acceptance criteria**

- Every mandatory requirement passes automated validation and isolated UAT.
- Exact final head has QA `PASS` or accepted `PASS_WITH_NOTES`.
- The reviewed migration is deterministic/idempotent and Production-unexecuted.
- No temporary UAT objects, requests, Orders, identities, or unauthorized
  configuration remain.
- Member code is recorded deferred.
- Merge/Production instructions remain a separate user approval gate.

**Completion evidence**

- Exact final SHA and Draft PR state.
- Complete command/test counts.
- Emulator and isolated-UAT workflow/run IDs.
- Projection fingerprints and zero-write repeat.
- Staff/Customer UAT checklist, image evidence, Queue/History evidence,
  responsive evidence, Excel evidence, cleanup counts, rollback result, and
  formal QA verdict.
- Explicit Production impact: none.

**Dependencies**

WP-CC-04 approved and merged. The Firebase Storage billing and Rules service
permission blocker must be explicitly resolved for isolated image UAT.

**Rollback or disable path**

Restore the saved isolated-UAT Hosting/Rules/Storage candidate, deactivate test
groups, remove exact synthetic objects/data, and verify zero residual test
records. Production rollback is outside this workstream.

## Current task state

| Work Package | Owner      | Status                                                                                                                  | Implementation commit                                                                                                       | QA verdict |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| WP-CC-01     | Chat 02    | Foundation and audit correction merged into `main`                                                                      | PR #21 merge `c692d7388c6e80ac8b644e5aad181d2cab22d313`; PR #22 correction merge `59d96e6473d977b01e14db4468d91327aa6904e4` | `PASS`     |
| WP-CC-02     | Chat 03    | Per-choice persistence correction and local validation complete; independent QA pending; remote image UAT remains gated | `feature/wp-cc-02-catalogue-admin` branch HEAD must be verified from Git                                                    | Pending    |
| WP-CC-03     | Unassigned | Blocked on WP-CC-02                                                                                                     | Pending                                                                                                                     | Pending    |
| WP-CC-04     | Unassigned | Blocked on WP-CC-03                                                                                                     | Pending                                                                                                                     | Pending    |
| WP-CC-05     | Unassigned | Blocked on WP-CC-04 and Storage approval                                                                                | Pending                                                                                                                     | Pending    |

## Commit and QA evidence

| Date       | Package                                  | Branch / SHA                                                                                                                                                                                                                                                                                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-28 | Planning                                 | `feature/configurable-catalogue-workstream-plan`, based on `6e28459fc1ecafb9eca33360a2f2e6d7b68694a5`                                                                                                                                                                                                      | Architecture and five-package plan prepared; application code unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-07-28 | WP-CC-01 implementation                  | `feature/configurable-catalogue-wp-cc-01`, starting SHA `20a030ded1bf30ab617f0d8bfba20bcec71732f1`; corrected implementation SHA `bc8f6fdad04fe4fc347c6ea11e13cf0aa24017bc`; merged through PR #21 as `c692d7388c6e80ac8b644e5aad181d2cab22d313`                                                           | Bounded catalogue/types/adapters/helpers, V3 projection with V2 compatibility, bounded private/public repositories, private-catalogue trusted confirmation, Rules, and dry-run-default migration completed. Focused 81/81, full app 378/378, canonical Rules 24/24, lint/build/format/Rules syntax/secret checks passed. Offline dry runs shared fingerprint `cc3-62a7a5c1ee582c6a`: 13 planned/0 performed then 0 planned/0 performed. Independent re-QA passed at the corrected implementation SHA before merge. No Firebase project, remote data, Production, deployment, or PR #14 action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-07-28 | WP-CC-01 formatting correction and re-QA | Failed QA SHA `59357627148ba954c978d07b72a462ad54f70c0c`; corrected/re-QA-passed SHA `bc8f6fdad04fe4fc347c6ea11e13cf0aa24017bc`                                                                                                                                                                            | Independent QA reported Prettier 3.6.2 failures caused by Windows checkout line endings. The changed supported files were formatted with Prettier 3.6.2 and pinned to LF in `.gitattributes`; `firestore.production.rules` remains excluded from Prettier and covered by the canonical Rules/emulator suite. Chat 04 re-QA passed: 22/22 Prettier-supported files, diff check, and exact-head identity; prior focused/full/Rules/lint/build/offline-dry-run evidence remains valid because the correction touched none of their implementation inputs. No semantic, scope, Rules, migration, dependency, remote, or Production change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-07-28 | WP-CC-01-CORR-01 audit correction        | Starting SHA `c692d7388c6e80ac8b644e5aad181d2cab22d313`; correction commit `8c06fcd75e44bc8237184054ac40f5fce1539e58`; merged through PR #22 as `59d96e6473d977b01e14db4468d91327aa6904e4`                                                                                                                 | Chat 03 corrected F-01/F-02/F-03. Focused tests passed 12/12, full application tests 381/381, and canonical Rules tests 24/24 on portable JDK 21; lint, Production build, formatting, diff check, and changed-file credential scan passed. Independent exact-head QA passed and PR #22 was squash-merged without deployment, Firebase Production, WP-CC-02 implementation, or PR #14 change during the merge gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-29 | WP-CC-02 Staff catalogue and images      | `feature/wp-cc-02-catalogue-admin`, starting SHA `59d96e6473d977b01e14db4468d91327aa6904e4`; original local commit `f18a9b10a5681e7ee4e81c567a9b9d2264ca77d4`; per-choice correction baseline `b2e8be803a74fef99add09de0d94ab08139b6a88`; overflow correction is branch HEAD and must be verified from Git | Staff group/choice/topping management, availability, deterministic stable IDs, Product assignments, atomic public projection synchronization, image rollback, Storage Rules, and the guarded isolated-UAT workflow remain intact. Canonical private Choice reads now query a 51-document sentinel, reject overflow with `Option group <groupId> exceeds the maximum of 50 choices.`, preserve the last valid subscription catalogue, surface a visible Staff error, and fail trusted/projection/offline reconstruction before partial publication. The subcollection authority, archive-only lifecycle, legacy reads, and 50-Choice create/reorder proofs remain unchanged. Overflow-focused 30/30, full application 418/418, Firestore Rules 26/26, and Storage Rules 3/3 passed; TypeScript, lint, Production build, actionlint, formatting/LF, diff, and credential checks passed. Offline normal dry runs retained fingerprint `cc3-62a7a5c1ee582c6a`, with 31 planned/0 performed then 0 planned/0 performed; the separate overflow dry run failed explicitly before planning and performed 0 writes. No push, PR, merge, deployment, remote Firebase, WP-CC-03, or PR #14 action. |

## Unresolved blockers and decisions

1. **User decision required before remote product-image UAT:** approve Blaze and
   the required Storage-Rules-to-Firestore service permission on
   `greek-yogert-customer-uat-2026`, or provide a separate approved
   Blaze-enabled isolated UAT project.
2. No Production Storage, billing, IAM, migration, Rules, Hosting, or data
   decision has been made.
3. PR #14 remains paused and untouched.
4. Optional member code remains deferred.

## Handoff

Chat 02 must:

1. read `AGENTS.md`, `CURRENT_STATUS.md`,
   `docs/AI_TEAM_PROTOCOL.md`, and this file;
2. verify the WP-CC-02 starting `origin/main` remains
   `59d96e6473d977b01e14db4468d91327aa6904e4`;
3. send the exact `feature/wp-cc-02-catalogue-admin` branch HEAD to Chat 04;
4. stop advancement on a QA `FAIL`; and
5. escalate only architecture/scope or the recorded Storage decision to Chat 01.

The next permitted action is independent Chat 04 QA of the exact WP-CC-02
branch HEAD. Chat 03 does not self-approve. WP-CC-03 remains paused, and remote
image UAT remains conditional on the recorded Storage gate.

No work after WP-CC-02 may start until repository governance and predecessor
approval/merge gates are satisfied.
