import type { Movie, MovieCatalog } from "@/lib/engine/types";
import { emperador } from "./emperador";

export const CATALOG: MovieCatalog = {
  [emperador.id]: emperador,
};

export const MOVIES: Movie[] = Object.values(CATALOG);

export const DEFAULT_MOVIE_ID = emperador.id;
