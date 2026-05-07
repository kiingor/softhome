// Registry dos testes da admissão. O catálogo (DB) referencia testes por
// `slug`; aqui carregamos o conteúdo correspondente.

import type { TestDefinition, TestSlug } from "./types";
import { logicaTest } from "./logica";
import { informaticaTest } from "./informatica";
import { discTest } from "./disc";
import { bigfive50Test } from "./bigfive_50";
import { bigfive30Test } from "./bigfive_30";
import { bigfive120Test } from "./bigfive_120";

const REGISTRY: Record<TestSlug, TestDefinition> = {
  logica: logicaTest,
  informatica: informaticaTest,
  disc: discTest,
  bigfive_30: bigfive30Test,
  bigfive_50: bigfive50Test,
  bigfive_120: bigfive120Test,
};

export function getTestDefinition(slug: string): TestDefinition | null {
  return REGISTRY[slug as TestSlug] ?? null;
}

export const ALL_TEST_SLUGS: TestSlug[] = [
  "logica",
  "informatica",
  "disc",
  "bigfive_30",
  "bigfive_50",
  "bigfive_120",
];

export type { TestDefinition, TestSlug } from "./types";
