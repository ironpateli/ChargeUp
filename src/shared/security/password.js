import bcrypt from 'bcryptjs';

const PASSWORD_SALT_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = '$2a$12$Mxu2R9BMUPLK9nX//q0rY.SdhbF4frE4l2N2L9JlM5tIVadRpwZ3K';

export async function hashPassword(password) {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export async function runDummyPasswordCheck(password) {
  return bcrypt.compare(password, DUMMY_PASSWORD_HASH);
}
