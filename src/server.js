import app from './app.js';
import { config } from './shared/config.js';

app.listen(config.port, () => {
  console.log(`ChargeUp API listening on http://localhost:${config.port}`);
});
