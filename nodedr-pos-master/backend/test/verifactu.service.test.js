// The AEAT submission cycle against a throwaway SQLite database and a fake sender (AEAT itself is not contacted).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const forge = require('node-forge');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodedr-vf-'));
process.env.DATABASE_URL = `file:${path.join(dir, 't.db')}`;
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.VERIFACTU_PRODUCER_ID = 'U0000000000000000000';
execFileSync(process.execPath, ['node_modules/.bin/prisma', 'migrate', 'deploy'], { env: process.env, cwd: path.join(__dirname, '..'), stdio: 'pipe' });

const prisma = require('../src/lib/prisma');
const vf = require('../src/lib/verifactu/service');

function p12(password) {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const attrs = [{ name: 'commonName', value: 'TEST SL' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password)).getBytes(), 'binary');
}

let n = 0;
async function sellOne() {
  n += 1;
  const product = await prisma.product.upsert({
    where: { barcode: 'P' }, update: {},
    create: { barcode: 'P', name: 'Paella', purchasePrice: 5, sellingPrice: 11, taxRate: 10, stock: 100 },
  });
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shopSettings.findFirst();
    const created = await tx.invoice.create({
      data: {
        invoiceNumber: `INV-${n}`, subtotal: 11, taxAmount: 1, totalAmount: 11, amountPaid: 11, paymentMethod: 'CARD',
        items: { create: [{ productId: product.id, name: 'Paella', quantity: 1, price: 11, taxRate: 10, taxAmount: 1, total: 11 }] },
      },
      include: { items: true },
    });
    await vf.recordSale(tx, shop, created);
    return created;
  });
}

test.before(async () => {
  await prisma.shopSettings.create({ data: { shopName: 'Bar', legalName: 'Bar & Grill SL', address1: 'x', currencyCode: 'EUR', currencySymbol: '€', gstEnabled: true } });
  await vf.saveSettings({ enabled: true, environment: 'TEST', series: 'T1', nif: 'B12345678' });
});
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('records queue until a certificate exists, then go out in chain order through the sender', async () => {
  await sellOne();
  await sellOne();
  await sellOne();
  assert.equal(await vf.submitAll(), 0, 'no certificate yet');

  await assert.rejects(vf.uploadCertificate(p12('pw'), 'wrong'), /Cannot read the certificate/);
  const s = await vf.uploadCertificate(p12('pw'), 'pw');
  assert.equal(s.hasCertificate, true);

  const calls = [];
  vf.setSender(async (env, pfx, pass, body) => {
    calls.push({ env, pass, body });
    const recs = await prisma.verifactuRecord.findMany({ orderBy: { seq: 'asc' } });
    return {
      csv: 'CSV1', state: 'ParcialmenteCorrecto', waitSeconds: 60, raw: '<raw/>',
      lines: recs.map((r, i) => ({
        issuerNif: r.issuerNif, number: r.invoiceNumber, issueDate: r.issueDate, operation: 'Alta',
        state: ['Correcto', 'Incorrecto', 'AceptadoConErrores'][i] || 'Correcto',
        errorCode: i === 1 ? '1100' : i === 2 ? '2000' : '', errorText: i === 1 ? 'bad' : i === 2 ? 'warn' : '',
      })),
    };
  });
  assert.equal((await vf.sendNow()).sent, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].env, 'TEST');
  assert.equal(calls[0].pass, 'pw');
  const order = [...calls[0].body.matchAll(/<sf:IDFactura><sf:IDEmisorFactura>[^<]*<\/sf:IDEmisorFactura><sf:NumSerieFactura>(T1-\d+)<\/sf:NumSerieFactura>/g)].map((m) => m[1]);
  assert.deepEqual(order, ['T1-000001', 'T1-000002', 'T1-000003'], 'sent in chain order');
  const recs = await prisma.verifactuRecord.findMany({ orderBy: { seq: 'asc' } });
  assert.deepEqual(recs.map((r) => r.status), ['ACCEPTED', 'REJECTED', 'ACCEPTED_WITH_ERRORS']);
  assert.equal(recs[0].csv, 'CSV1');
  assert.equal(recs[1].errorCode, '1100');
  assert.equal(await vf.submitAll(), 0, "AEAT's waiting interval is honoured");
});

test('a transport failure marks pending records ERROR and retries later', async () => {
  await sellOne();
  await prisma.verifactuRecord.updateMany({ data: { nextAttemptAt: new Date(0) } });
  vf.setSender(async () => {
    throw new Error('aeat: contacting the tax agency: ECONNRESET');
  });
  assert.equal(await vf.submitAll(), 0);
  const last = await prisma.verifactuRecord.findFirst({ orderBy: { seq: 'desc' } });
  assert.equal(last.status, 'ERROR');
  assert.match(last.errorText, /ECONNRESET/);
  assert.ok(last.nextAttemptAt.getTime() > Date.now());
  vf.setSender(null);
});

test('series and NIF are locked once records exist; the whole chain verifies', async () => {
  await assert.rejects(vf.saveSettings({ enabled: true, environment: 'TEST', series: 'T2', nif: 'B12345678' }), /cannot change/);
  const v = await vf.verifyChain();
  assert.equal(v.ok, true);
  assert.equal(v.checked, 4);
});
