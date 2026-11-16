// Lets Node run the game's TypeScript sources as they are: Node 22 strips the types itself,
// this hook only adds the ".ts" that Vite-style imports ("./data") leave out.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw error;
  }
}
