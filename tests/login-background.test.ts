/**
 * Which of the two backgrounds the sign-in screen gets.
 *
 * The rule has to hold in both directions: a catalog too thin for the poster
 * wall must not be shown a wall of gaps, and a choice made in Settings must
 * beat the count — including the awkward one, where someone with two thousand
 * posters wants the animation anyway.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POSTER_WALL_MINIMUM,
  isLoginBackground,
  resolveLoginBackground,
} from "@/lib/login-background";

test("left to itself, the wall needs enough posters to fill", () => {
  assert.equal(resolveLoginBackground("auto", 0), "terminal");
  assert.equal(resolveLoginBackground("auto", POSTER_WALL_MINIMUM - 1), "terminal");
  assert.equal(resolveLoginBackground("auto", POSTER_WALL_MINIMUM), "posters");
  assert.equal(resolveLoginBackground("auto", 2000), "posters");
});

test("a choice from Settings wins over the count, both ways", () => {
  assert.equal(resolveLoginBackground("posters", 0), "posters");
  assert.equal(resolveLoginBackground("terminal", 5000), "terminal");
});

test("an unset or unknown value falls back to deciding by the count", () => {
  for (const value of [null, undefined, "", "something else"]) {
    assert.equal(resolveLoginBackground(value, 0), "terminal");
    assert.equal(resolveLoginBackground(value, 500), "posters");
  }
});

test("only the three known values are accepted from outside", () => {
  assert.ok(isLoginBackground("auto"));
  assert.ok(isLoginBackground("posters"));
  assert.ok(isLoginBackground("terminal"));
  for (const junk of ["Auto", "video", "", 1, null, undefined, {}]) {
    assert.equal(isLoginBackground(junk), false, `accepted ${String(junk)}`);
  }
});
