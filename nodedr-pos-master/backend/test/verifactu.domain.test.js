// Spain VERI*FACTU building blocks. The hash vectors are the three worked examples in AEAT's hash specification
// v0.1.2 and the QR vector is the encoding example in the QR specification v0.5.0.
const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const forge = require('node-forge');
const d = require('../src/lib/verifactu/domain');
const aeat = require('../src/lib/verifactu/aeat');

const sys = {
  producerName: 'NODEDR INFOTECH PRIVATE LIMITED', producerCountry: 'IN', producerIdType: '04', producerId: 'U0000000000000000000',
  systemName: 'NODEDR POS', systemId: 'NP', version: '1.0.0', installationNumber: 'inst-1',
};

test('AEAT official hash vectors (cases 1-3)', () => {
  const id1 = { issuerNif: '89890001K', number: '12345678/G33', issueDate: '01-01-2024' };
  const id2 = { issuerNif: '89890001K', number: '12345679/G34', issueDate: '01-01-2024' };
  const first = { id: id1, invoiceType: 'F1', taxTotalCents: 1235, totalCents: 12345, previousHash: '', generatedAt: '2024-01-01T19:20:30+01:00' };
  assert.equal(
    d.altaString(first),
    'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00'
  );
  const h1 = d.fingerprint(d.altaString(first));
  assert.equal(h1, '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
  const h2 = d.fingerprint(d.altaString({ ...first, id: id2, previousHash: h1, generatedAt: '2024-01-01T19:20:35+01:00' }));
  assert.equal(h2, 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97');
  const c = { id: id2, previousHash: h2, generatedAt: '2024-01-01T19:20:40+01:00' };
  assert.equal(
    d.cancelString(c),
    'IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34&FechaExpedicionFacturaAnulada=01-01-2024&Huella=F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00'
  );
  assert.equal(d.cancelHash({ ...c, previous: { hash: h2 } }), '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68');
});

test('QR URL: "&" is percent-encoded, two decimals, test and production hosts', () => {
  const id = { issuerNif: '89890001K', number: '12345678&G33', issueDate: '01-01-2024' };
  assert.equal(
    d.qrUrl('TEST', id, 24140),
    'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.40'
  );
  assert.ok(d.qrUrl('PRODUCTION', id, 24140).startsWith('https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?'));
  assert.throws(() => d.qrUrl('TEST', { issuerNif: 'X', number: '1', issueDate: '01-01-2024' }, 1));
});

test('Madrid timestamps: +01:00 in winter, +02:00 in summer', () => {
  assert.deepEqual(d.madridParts(new Date('2024-01-01T18:20:30Z')), { day: '01-01-2024', timestamp: '2024-01-01T19:20:30+01:00' });
  assert.deepEqual(d.madridParts(new Date('2024-07-01T22:30:00Z')), { day: '02-07-2024', timestamp: '2024-07-02T00:30:00+02:00' });
});

test('breakdown: IVA backed out per rate, shares add up to the cent, refunds are negative, odd rates refused', () => {
  const r = d.buildBreakdown([{ grossCents: 1100, ratePercent: 10 }, { grossCents: 1210, ratePercent: 21 }], 2310);
  assert.deepEqual(r.breakdown, [{ rate: 21, baseCents: 1000, quotaCents: 210 }, { rate: 10, baseCents: 1000, quotaCents: 100 }]);
  assert.equal(r.taxTotalCents, 310);
  for (const target of [1999, 2000, 2307, 1]) {
    const x = d.buildBreakdown([{ grossCents: 777, ratePercent: 10 }, { grossCents: 1333, ratePercent: 21 }, { grossCents: 201, ratePercent: 4 }], target);
    assert.equal(x.breakdown.reduce((a, b) => a + b.baseCents + b.quotaCents, 0), target);
  }
  const neg = d.buildBreakdown([{ grossCents: 1100, ratePercent: 10 }], -550);
  assert.deepEqual(neg.breakdown[0], { rate: 10, baseCents: -500, quotaCents: -50 });
  assert.throws(() => d.buildBreakdown([{ grossCents: 100, ratePercent: 18 }], 100), /not a Spanish IVA rate/);
});

test('records: first record, chaining, R5 and XML escaping', () => {
  const mk = (over = {}) => {
    const b = d.buildBreakdown([{ grossCents: 1100, ratePercent: 10 }], 1100);
    return {
      id: { issuerNif: 'B12345678', number: 'T1-000001', issueDate: '02-07-2024' }, issuerName: 'Bar & Grill SL', invoiceType: 'F2',
      description: 'Venta de mercancías', breakdown: b.breakdown, taxTotalCents: b.taxTotalCents, totalCents: b.totalCents,
      previous: null, system: sys, generatedAt: '2024-07-02T00:30:00+02:00', ...over,
    };
  };
  const a = mk();
  d.validateAlta(a);
  const x = d.altaXml(a);
  assert.match(x, /<sf:PrimerRegistro>S<\/sf:PrimerRegistro>/);
  assert.match(x, /<sf:NombreRazonEmisor>Bar &amp; Grill SL<\/sf:NombreRazonEmisor>/);
  assert.ok(x.includes(`<sf:Huella>${d.altaHash(a)}</sf:Huella>`));
  const b = mk({ id: { ...a.id, number: 'T1-000002' }, previous: { ...a.id, hash: d.altaHash(a) } });
  assert.ok(d.altaXml(b).includes(`<sf:Huella>${d.altaHash(a)}</sf:Huella></sf:RegistroAnterior>`));
  const rb = d.buildBreakdown([{ grossCents: 1100, ratePercent: 10 }], -1100);
  const r5 = d.altaXml(mk({ invoiceType: 'R5', id: { ...a.id, number: 'RT1-000001' }, breakdown: rb.breakdown, taxTotalCents: rb.taxTotalCents, totalCents: rb.totalCents, rectified: [a.id] }));
  assert.match(r5, /<sf:TipoRectificativa>I<\/sf:TipoRectificativa>/);
  assert.match(r5, /<sf:ImporteTotal>-11.00<\/sf:ImporteTotal>/);
  assert.throws(() => d.validateAlta(mk({ id: { issuerNif: 'B123', number: '1', issueDate: '02-07-2024' } })), /NIF/);
});

test('AEAT answers: lines are read, faults and unreadable bodies are errors', () => {
  const ok = `<env:Envelope xmlns:env="x"><env:Body><r:RespuestaRegFactuSistemaFacturacion xmlns:r="y" xmlns:t="z"><r:CSV>ABC</r:CSV><r:TiempoEsperaEnvio>60</r:TiempoEsperaEnvio><r:EstadoEnvio>ParcialmenteCorrecto</r:EstadoEnvio>
<r:RespuestaLinea><r:IDFactura><t:IDEmisorFactura>B1</t:IDEmisorFactura><t:NumSerieFactura>T1-000001</t:NumSerieFactura><t:FechaExpedicionFactura>02-07-2024</t:FechaExpedicionFactura></r:IDFactura><r:Operacion><t:TipoOperacion>Alta</t:TipoOperacion></r:Operacion><r:EstadoRegistro>Incorrecto</r:EstadoRegistro><r:CodigoErrorRegistro>1100</r:CodigoErrorRegistro><r:DescripcionErrorRegistro>Valor &quot;x&quot; no válido</r:DescripcionErrorRegistro></r:RespuestaLinea>
</r:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>`;
  const r = aeat.parseResponse(200, ok);
  assert.equal(r.csv, 'ABC');
  assert.equal(r.waitSeconds, 60);
  assert.deepEqual(r.lines[0], { issuerNif: 'B1', number: 'T1-000001', issueDate: '02-07-2024', operation: 'Alta', state: 'Incorrecto', errorCode: '1100', errorText: 'Valor "x" no válido' });
  assert.throws(() => aeat.parseResponse(500, '<s:Envelope xmlns:s="x"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>Certificado no válido</faultstring></s:Fault></s:Body></s:Envelope>'), aeat.AeatFault);
  assert.throws(() => aeat.parseResponse(502, '<html>Bad gateway</html>'), /HTTP 502/);
});

function makeCert(cn, san) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 86400000 * 30);
  const attrs = [{ name: 'commonName', value: cn }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  if (san) cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: san }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { keys, cert, pem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

test('mutual TLS: the client presents the .p12 certificate to a server that requires one', async () => {
  const server = makeCert('localhost', 'localhost');
  const client = makeCert('TAXPAYER SL B12345678');
  const p12 = Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(client.keys.privateKey, [client.cert], 'pw')).getBytes(), 'binary');
  assert.equal(aeat.inspectCertificate(p12, 'pw').subject, 'CN=TAXPAYER SL B12345678');
  assert.throws(() => aeat.inspectCertificate(p12, 'wrong'), /Cannot read the certificate/);
  let seenCn = '';
  const srv = https.createServer({ key: server.keyPem, cert: server.pem, requestCert: true, rejectUnauthorized: false, ca: [client.pem] }, (req, res) => {
    seenCn = req.socket.getPeerCertificate().subject?.CN ?? '';
    req.resume();
    req.on('end', () => {
      res.end('<env:Envelope xmlns:env="x"><env:Body><r:RespuestaRegFactuSistemaFacturacion xmlns:r="y"><r:CSV>CSV9</r:CSV><r:TiempoEsperaEnvio>60</r:TiempoEsperaEnvio><r:EstadoEnvio>Correcto</r:EstadoEnvio></r:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const out = await aeat.postSoap(`https://localhost:${srv.address().port}/x`, p12, 'pw', '<x/>', { ca: server.pem });
    assert.equal(out.csv, 'CSV9');
    assert.equal(out.state, 'Correcto');
    assert.equal(seenCn, 'TAXPAYER SL B12345678');
  } finally {
    srv.close();
  }
});
