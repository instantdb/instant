import { InstantSchemaDef } from './schemaTypes.ts';

export type FrameworkConfig<S extends InstantSchemaDef<any, any, any>> = {
  appId: string;
  schema?: S;
  apiURI?: string;
  token: string;
};

export class FrameworkClient {
  private params: FrameworkConfig<any>;

  constructor(params: FrameworkConfig<any>) {
    this.params = params;
  }

  public getTriplesAndQueryResult = async (query: any) => {
    const response = await fetch('http://localhost:8888/admin/triples', {
      method: 'POST',
      headers: {
        'app-id': this.params.appId,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.params.token}`,
      },
      body: JSON.stringify({
        query: query,
        'inference?': true,
      }),
    });

    const data = await response.json();
    console.log(data[0]['data']['datalog-result']['join-rows']);
    return data;
  };
}
