# ContactoLetreros

ContactoLetreros ayuda a convertir letreros físicos de alquiler o venta en oportunidades que se pueden revisar y contactar por WhatsApp. También permite guardar enlaces de Airbnb, Facebook y Adondevivir para evaluar todo desde una misma búsqueda.

## Funcionalidades actuales

- Crear búsquedas y organizar oportunidades, incluidas las de `Sin clasificar`.
- Capturar una o varias fotos desde el teléfono o subirlas desde el equipo.
- Guardar primero y extraer localmente teléfonos, operación y tipo de inmueble con OCR. La revisión sigue siendo manual.
- Capturar ubicación y mostrar oportunidades en lista y mapa.
- Guardar enlaces externos, notas, favoritos y estados: Nueva, Contactada, Visitada y Descartada.
- Abrir WhatsApp con un mensaje contextualizado. El envío se confirma en WhatsApp.
- Usar la aplicación sin cuenta con almacenamiento local. Al iniciar sesión con Google, sincronizar búsquedas, oportunidades y fotos con Supabase.

No hay scraping de anuncios ni envío automático por una API de WhatsApp.

## Ejecutar con Bun

1. Instala [Bun](https://bun.sh/docs/installation).
2. Instala las dependencias:

   ```bash
   bun install
   ```

3. Crea tu archivo local de variables:

   ```bash
   cp .env.example .env.local
   ```

4. Completa las variables necesarias y levanta el servidor:

   ```bash
   bun run dev
   ```

5. Abre [http://localhost:3000](http://localhost:3000).

Comprueba los tipos con:

```bash
bun run typecheck
```

## Variables de entorno

`.env.example` contiene estas variables:

| Variable | Uso | Exposición |
| --- | --- | --- |
| `OPENAI_API_KEY` | Reservada para integración con OpenAI. La extracción actual usa OCR local y no la requiere. | Secreta, solo servidor. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. | Pública para el navegador. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable de Supabase para autenticar el cliente con RLS. | Pública para el navegador. |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones administrativas de servidor. No es necesaria para el flujo actual de sincronización del navegador. | Secreta, solo servidor. |
| `NEXT_PUBLIC_SITE_URL` | URL pública de la aplicación. Usa `http://localhost:3000` en desarrollo y la URL HTTPS final en producción. | Pública. |
| `GEOCODER_BASE_URL` | Base del geocodificador inverso. El valor por defecto es Nominatim. | Servidor. |
| `POLAR_ACCESS_TOKEN` | Token de acceso de la organización Polar para el futuro Pase de búsqueda. | Secreta, solo servidor. |
| `POLAR_WEBHOOK_SECRET` | Secreto para verificar futuros webhooks de Polar. | Secreta, solo servidor. |
| `POLAR_SEARCH_PASS_PRODUCT_ID` | Identificador del producto Polar del futuro Pase de búsqueda. | Servidor. |

No pegues secretos en el chat, issues, commits o capturas. Nunca nombres secretos con el prefijo `NEXT_PUBLIC_`, ya que Next.js los incluye en el navegador.

## Configurar Supabase y Google OAuth

La aplicación puede usarse localmente sin Supabase. Para iniciar sesión y sincronizar, completa las variables de Supabase en `.env.local`. Las migraciones `202607230001` y `202607230002` ya están aplicadas en el proyecto Supabase ContactoLetreros. Si conectas otro proyecto Supabase, aplícalas en ese proyecto y en ese orden.

### 1. Crear credenciales en Google

1. En [Google Cloud Console](https://console.cloud.google.com/), crea o selecciona un proyecto y configura la pantalla de consentimiento OAuth.
2. Crea un cliente OAuth 2.0 de tipo **Aplicación web**.
3. En **Authorized JavaScript origins**, agrega:
   - `http://localhost:3000`
   - La URL HTTPS de producción, por ejemplo `https://tu-dominio.com`
4. En **Authorized redirect URIs**, agrega exactamente:

   ```text
   https://coheazpgpromgucmfeou.supabase.co/auth/v1/callback
   ```

5. Conserva el Client ID y Client Secret en un gestor de secretos. La guía oficial de [Google login con Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google) explica este flujo.

### 2. Habilitar Google en Supabase

1. En Supabase abre **Authentication > Providers > Google**.
2. Habilita el proveedor y pega el Client ID y Client Secret de Google.
3. Guarda los cambios.

### 3. Configurar URLs en Supabase

En **Authentication > URL Configuration** configura:

- **Site URL**: la URL HTTPS de producción. Mientras solo trabajes localmente, puede ser `http://localhost:3000`.
- **Redirect URLs**: agrega `http://localhost:3000` y la URL HTTPS exacta de producción. Si usas rutas, agrega también las rutas que puedan recibir el retorno.

`signInWithOAuth` vuelve al origen actual de la aplicación, así que cada origen usado debe estar permitido en la lista. Consulta la documentación oficial sobre [Redirect URLs de Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

## Polar, preparado pero no activo

Los checkouts de Polar y el Pase de búsqueda todavía no están activados en esta aplicación. Por eso, configurar sus variables no habilita pagos ni debe bloquear las pruebas actuales.

Cuando se active esa integración:

1. En la configuración de la organización de Polar crea un **Organization Access Token** con los permisos mínimos necesarios.
2. Guárdalo como `POLAR_ACCESS_TOKEN` solo en el entorno del servidor.
3. Crea el endpoint de webhook en Polar para la futura ruta de producción y copia su secreto de firma como `POLAR_WEBHOOK_SECRET`.
4. Crea o identifica el producto del Pase de búsqueda y guarda su ID como `POLAR_SEARCH_PASS_PRODUCT_ID`.
5. Configura estos valores en el proveedor de despliegue, no en código ni en variables `NEXT_PUBLIC_`.

Polar recomienda los Organization Access Tokens y exige mantenerlos privados. Consulta su documentación oficial de la [API de Polar](https://polar.sh/docs/api-reference/introduction). No compartas el token ni el webhook secret por chat.

## Prueba manual

1. Inicia el proyecto con `bun run dev`.
2. Crea una búsqueda, captura una foto o guarda un enlace y verifica que aparece en la lista.
3. Abre la oportunidad, revisa el teléfono y usa el botón de WhatsApp. Confirma que se abre un borrador con contexto.
4. Con Supabase configurado, inicia sesión con Google en `http://localhost:3000` y confirma que vuelve a la aplicación.
5. Haz un cambio y verifica el mensaje de guardado en la cuenta. Revisa en Supabase que se creen búsquedas, oportunidades y, si aplica, fotos.

## Troubleshooting

| Problema | Revisión |
| --- | --- |
| No aparece el inicio de sesión | Confirma `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, reinicia `bun run dev` y verifica que Google esté habilitado en Supabase. |
| Google muestra `redirect_uri_mismatch` | El callback de Google debe ser exactamente `https://coheazpgpromgucmfeou.supabase.co/auth/v1/callback`. No uses la URL local como callback de Google. |
| Google vuelve a una URL no permitida | Agrega el origen local o la URL HTTPS de producción en **Redirect URLs** de Supabase. Revisa también `NEXT_PUBLIC_SITE_URL`. |
| La sesión inicia, pero no sincroniza | En el proyecto Supabase ContactoLetreros, verifica que `202607230001` y `202607230002` figuren como aplicadas. Si conectaste otro proyecto, aplícalas allí en ese orden; después revisa las políticas RLS y las variables locales. |
| No se obtiene ubicación | Autoriza la geolocalización en el navegador. La captura y el guardado siguen funcionando sin ubicación. |
| El OCR no detecta un teléfono | Revisa y escribe los datos manualmente. La extracción es asistida y puede fallar con fotos oscuras o texto poco legible. |
| El mapa o geocodificador falla | Reintenta más tarde. El servicio puede responder con límite de tasa; los datos locales no se eliminan. |
