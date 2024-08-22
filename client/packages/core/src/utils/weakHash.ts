/**
 * Wrapper for a fast hash function, where we want consistent, unique hashing
 * and are not concerned with the hash being decoded
 * */
import { MD5 } from "object-hash";

const weakHash = MD5;

export default weakHash;
