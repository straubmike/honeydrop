const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function createInviteCode(length = 6): string {
  let code = ''
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return code
}
