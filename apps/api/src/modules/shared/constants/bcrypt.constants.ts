// Cost 12 is a practical production baseline. Login flows upgrade weaker
// existing hashes after successful authentication and never downgrade hashes.
export const BCRYPT_SALT_ROUNDS = 12;

// Fixed, non-login dummy hash used to keep unknown-account login timing close
// to an ordinary password comparison without hashing input on every attempt.
export const DUMMY_PASSWORD_HASH =
  '$2b$12$TivXb9R0HwhxN/hjavR9QuxWr8bz7FnrGrjVHaPwAPDlEfhC.6DFa';
