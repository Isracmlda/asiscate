# Backend gratuito para la asistencia QR de encuentros

El Worker de esta carpeta reemplaza las cuatro llamadas de asistencia QR que antes usaban Firebase Cloud Functions. Firebase Hosting y Firestore siguen en el plan Spark. El Worker consulta Firestore mediante la API REST y valida los tokens de Firebase Authentication.

## 1. Autorizar Wrangler

Desde la raíz del proyecto:

```powershell
npx wrangler login
npx wrangler whoami
```

La segunda orden debe mostrar la cuenta Cloudflare autorizada.

## 2. Crear una cuenta de servicio para Firestore

En Google Cloud Console, selecciona el proyecto `asiscate-el-carmen` y abre **IAM y administración > Cuentas de servicio**.

1. Crea una cuenta llamada `asiscate-attendance-worker`.
2. Asígnale el rol **Cloud Datastore User** (`roles/datastore.user`). Este rol permite lectura y escritura de documentos de Firestore; protege la clave como una credencial sensible.
3. Abre la cuenta creada, ve a **Claves > Agregar clave > Crear clave nueva > JSON** y descarga el archivo.

Firestore concede acceso de servidor con IAM; el rol se asigna al proyecto y no depende de Cloud Functions ni de cambiar Firebase a Blaze. [Referencia de IAM de Firestore](https://firebase.google.com/docs/firestore/security/iam)

## 3. Publicar el Worker

```powershell
npx wrangler deploy --config cloudflare/wrangler.jsonc
```

La dirección publicada para este proyecto es `https://asiscate-student-attendance.asiscate-elcarmen.workers.dev`. El Worker ya existe en Cloudflare, pero todavía necesita el secreto de Firebase antes de atender operaciones de asistencia.

## 4. Guardar la credencial en Cloudflare

Desde la raíz del proyecto, usa el archivo JSON descargado. Sustituye la ruta por la ubicación real del archivo:

```powershell
Get-Content -Raw ".\asiscate-attendance-worker-key.json" | ConvertFrom-Json | ConvertTo-Json -Compress | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --config cloudflare/wrangler.jsonc
```

El contenido viaja por la entrada estándar directamente a Wrangler; no queda escrito en el comando ni se muestra en pantalla. La clave queda como secreto del Worker; no la agregues a Git, a `.env.local` ni a un mensaje. Después de confirmar que Wrangler guardó el secreto, elimina el archivo JSON descargado o guárdalo en un gestor seguro.

## 5. Conectar la app

En el archivo `.env.local` de la raíz del proyecto, agrega la dirección que mostró Wrangler:

```dotenv
VITE_STUDENT_ATTENDANCE_WORKER_URL=https://asiscate-student-attendance.asiscate-elcarmen.workers.dev
```

La app ya tiene esta URL guardada en tu `.env.local`. Después de configurar el secreto, publica la app en Firebase Hosting con:

```powershell
npm run deploy
```

Ese comando publica solo Hosting para conservar Firebase en Spark. Para cambiar el código del Worker, vuelve a ejecutar el paso 3.
