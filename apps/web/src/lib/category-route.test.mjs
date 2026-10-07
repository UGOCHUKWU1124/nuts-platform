import assert from "node:assert/strict";
import test from "node:test";

import { resolveCategoryRoute } from "./category-route.ts";

const category = (id, slug, children = []) => ({
  id,
  slug,
  name: slug,
  description: null,
  imageUrl: null,
  parentId: null,
  sortOrder: 0,
  status: "ACTIVE",
  isActive: true,
  path: slug,
  depth: 0,
  isLeaf: children.length === 0,
  isRoot: true,
  children,
});

const tree = [
  category("clothing", "clothing", [
    {
      ...category("mens", "mens"),
      parentId: "clothing",
      depth: 1,
      isRoot: false,
    },
  ]),
];
const mens = tree[0].children[0];

const traversal = (matchedNode, matchedDepth, remainingSlugs) => ({
  matchedNode,
  matchedChain: [matchedNode],
  matchedDepth,
  breadcrumbs: [],
  remainingSlugs,
});

test("a complete category path wins even if its slug could match a product", () => {
  const result = resolveCategoryRoute(traversal(mens, 2, []), ["clothing", "mens"]);
  assert.equal(result.kind, "category");
  if (result.kind === "category") {
    assert.equal(result.category.id, "mens");
    assert.deepEqual(result.categorySlugs, ["clothing", "mens"]);
  }
});

test("one unmatched trailing segment is treated as a product within its matched category", () => {
  const result = resolveCategoryRoute(
    traversal(mens, 2, ["linen-shirt"]),
    ["clothing", "mens", "linen-shirt"],
  );
  assert.equal(result.kind, "product");
  if (result.kind === "product") {
    assert.equal(result.category.id, "mens");
    assert.equal(result.productSlug, "linen-shirt");
    assert.deepEqual(result.categorySlugs, ["clothing", "mens"]);
  }
});

test("unmatched category prefixes are not mistaken for product routes", () => {
  assert.equal(
    resolveCategoryRoute(traversal(null, 0, ["unknown", "linen-shirt"]), [
      "unknown",
      "linen-shirt",
    ]).kind,
    "not-found",
  );
});

test("root categories resolve as category pages", () => {
  assert.equal(resolveCategoryRoute(traversal(tree[0], 1, []), ["clothing"]).kind, "category");
});
