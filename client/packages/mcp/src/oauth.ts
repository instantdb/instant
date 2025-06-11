import { Express, Request, Response } from 'express';
import cors from 'cors';
import z from 'zod';
import { randomUUID } from 'crypto';

// Keep track of clients
// Keep track of token for a client

const grantTypes = ['authorization_code', 'refresh_token'] as const;

const responseTypes = ['code'] as const;

const clientRegistrationValidator = z
  .object({
    redirect_uris: z
      .array(
        z.string().url({ message: 'Each redirect_uri must be a valid URL.' }),
      )
      .nonempty({ message: 'At least one redirect_uri is required.' }),
    client_name: z.string().optional(),
    client_uri: z.string().url().optional(),

    grant_types: z
      .array(z.enum(grantTypes))
      .min(1)
      .default(['authorization_code']),

    response_types: z.array(z.enum(responseTypes)).min(1).default(['code']),
  })
  .superRefine((data, ctx) => {
    if (
      data.grant_types.includes('authorization_code') &&
      !data.response_types.includes('code')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['response_types'],
        message:
          "response_types must include 'code' when grant_types includes 'authorization_code'.",
      });
    }
  });

type ClientRegistrationInput = z.infer<typeof clientRegistrationValidator>;

type Client = ClientRegistrationInput & {
  client_id: string;
  client_secret: string;
  client_id_issued_at: number;
};

/* XXX: client store */
export const clientStore: Client[] = [];

function generateClient(input: ClientRegistrationInput) {
  const id = randomUUID();
  const secret = randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    ...input,
    client_id: id,
    client_secret: secret,
    client_id_issued_at: issuedAt,
  };
}

export function addOAuthIntermediaryClient(app: Express) {
  app.options('/register', cors());
  app.post('/register', cors(), (req: Request, res: Response) => {
    const input = clientRegistrationValidator.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({
        errors: input.error.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }
    const client = generateClient(input.data);
    clientStore.push(client);
    res.status(200).json(client);
  });
}
