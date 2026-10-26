import { readFile, appendFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const api = 'https://central.sonatype.com/api/v1/publisher';

export async function publishBundle({ bundle, name, token, fetcher = fetch, wait = delay, record = console.log }) {
  const request = async (path, body) => {
    const response = await fetcher(`${api}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal: AbortSignal.timeout(120_000),
      redirect: 'error',
    });
    // Do not include request headers or an untrusted response body in logs.
    if (!response.ok) throw new Error(`Central ${path.split('?')[0]} returned HTTP ${response.status}`);
    return response;
  };
  const form = new FormData();
  form.append('bundle', new Blob([bundle], { type: 'application/octet-stream' }), `${name}.zip`);
  const id = (await (await request(`upload?${new URLSearchParams({ name, publishingType: 'AUTOMATIC' })}`, form)).text()).trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Central returned an invalid deployment ID');
  await record(`Central deployment: ${id}`);
  // Never retry an upload: a timeout may have created a deployment already.
  for (let attempt = 0; attempt < 80; attempt++) {
    const { deploymentState } = await (await request(`status?id=${id}`)).json();
    if (deploymentState === 'PUBLISHED') return id;
    if (!['PENDING', 'VALIDATING', 'VALIDATED', 'PUBLISHING'].includes(deploymentState)) {
      throw new Error(`Central deployment ${id}: ${deploymentState}; inspect the Portal for details`);
    }
    await wait(15_000);
  }
  throw new Error(`Central deployment ${id} is still pending; inspect it before retrying`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { CENTRAL_USERNAME, CENTRAL_PASSWORD, GITHUB_STEP_SUMMARY } = process.env;
  if (!CENTRAL_USERNAME || !CENTRAL_PASSWORD) throw new Error('Central user token secrets are required');
  const version = JSON.parse(await readFile('packages/capacitor-native-ui-engine/package.json', 'utf8')).version;
  const name = `native-ui-engine-${version}`;
  const bundle = await readFile(`packages/capacitor-native-ui-engine/android/build/distributions/${name}-central.zip`);
  const token = Buffer.from(`${CENTRAL_USERNAME}:${CENTRAL_PASSWORD}`).toString('base64');
  await publishBundle({
    bundle,
    name,
    token,
    record: async (message) => {
      console.log(message);
      if (GITHUB_STEP_SUMMARY) await appendFile(GITHUB_STEP_SUMMARY, `${message}\n`);
    },
  });
}
