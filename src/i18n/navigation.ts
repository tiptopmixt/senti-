import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Wrapper di navigazione consapevoli della lingua.
 * Usare questi al posto di next/link e next/navigation così il prefisso di
 * lingua viene gestito automaticamente.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
