export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!result.success) {
      const fieldErrors = {};

      for (const issue of result.error.issues) {
        const fieldPath = issue.path
          .filter((part) => !['body', 'params', 'query'].includes(part))
          .join('.');
        const field = fieldPath || 'request';

        fieldErrors[field] ??= [];
        fieldErrors[field].push(issue.message);
      }

      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: {
            fieldErrors
          }
        }
      });
    }

    req.validated = result.data;
    return next();
  };
}
