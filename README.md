# Agenda de pacientes

Aplicación web para gestionar una agenda clínica con:

- carga de datos personales
- fecha y hora del turno
- diagnóstico, médico solicitante, obra social y contacto
- observaciones
- carga de pedidos médicos en PDF o Word
- recordatorios vía WhatsApp y mail
- historial clínico del paciente
- backup y restauración de datos
- importación y exportación de agenda

## Cómo usarlo

1. Abrir la app en el navegador a la URL local del proyecto.
2. Iniciar sesión con el usuario y la contraseña configurados.
3. Cargar un paciente desde la sección de turno.
4. Revisar la agenda por día o por mes.
5. Usar los botones de recordatorio para abrir WhatsApp o mail.
6. Marcar si el paciente asistió o no.
7. Adjuntar o consultar pedidos médicos en el historial.

## Ejecutar localmente

Desde la carpeta del proyecto:

```bash
npm install
npm start
```

Luego abrir en el navegador:

```text
http://localhost:3001
```

En desarrollo, el acceso inicial es `admin` / `admin123`. Estas credenciales son solo para uso local; no las uses en producción.

## Despliegue en servidor

Usá Node.js 20 LTS o superior. Instalá las dependencias de producción y configurá el entorno antes de iniciar:

```bash
npm ci --omit=dev
```

Copiá `.env.example` a `.env` y definí `NODE_ENV=production`, `ADMIN_USERNAME`, una `ADMIN_PASSWORD` única de al menos 12 caracteres y un `SESSION_SECRET` aleatorio de al menos 32 caracteres. Se puede generar con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Configurá `HOSPI_DB_PATH` y `HOSPI_UPLOADS_DIR` como rutas de almacenamiento persistente y con permisos de escritura para el proceso. Protegé el sitio con HTTPS: las cookies de sesión en producción requieren conexión segura. No publiques `.env` ni copies las credenciales locales.

La aplicación no carga pacientes ficticios automáticamente. En producción, el usuario administrador se crea o actualiza desde las variables de entorno en cada inicio. Para migrar una instalación, trasladá la base SQLite y la carpeta de adjuntos conservando sus rutas; el archivo JSON de backup no contiene los bytes de los documentos.

Ejecutá las verificaciones antes de desplegar:

```bash
npm test
```

## Funciones de backup y restauración

### Backup
Permite guardar una copia de seguridad de la agenda completa en un archivo.

Qué hace:
- exporta todos los pacientes activos
- incluye pacientes archivados o eliminados
- guarda la estructura completa para luego restaurarla

Cómo se usa:
1. En la interfaz, click en “Backup”.
2. Se descarga un archivo con la información exportada.
3. Guardarlo en una carpeta segura de la clínica.

Cuándo usarlo:
- antes de hacer cambios importantes
- antes de limpiar o actualizar la base
- como respaldo periódico

### Restore
Permite recuperar la agenda desde un backup exportado.

Qué hace:
- restaura la información guardada en el archivo
- vuelve a cargar pacientes y datos de la base

Cómo se usa:
1. Click en “Restore backup”.
2. Seleccionar el archivo generado con backup.
3. Confirmar la restauración.
4. La agenda vuelve a quedar en el estado del backup.

### Importar CSV
Permite subir pacientes desde un archivo CSV.

Qué hace:
- lee filas del archivo
- normaliza campos como recordatorios y estados
- crea o actualiza pacientes desde la importación

Cómo se usa:
1. Click en “Importar CSV”.
2. Seleccionar el archivo `.csv`.
3. Revisar que el archivo tenga columnas válidas.
4. Confirmar la carga.

Formato recomendado:

```csv
nombre,apellido,documento,obraSocial,diagnostico,medico,telefono,mail,fechaTurno,horaTurno,observaciones,recordatorioWsp,recordatorioMail
Juan,Pérez,12345678,OSDE,Consulta,Dr. García,5491123456789,juan@mail.com,2026-09-25,10:30,Sin observaciones,true,false
```

### Exportar CSV
Permite descargar toda la agenda o la información filtrada en formato CSV.

Qué hace:
- genera un archivo CSV con los datos de pacientes
- sirve para mover la información a otra planilla o sistema

Cómo se usa:
1. Click en “Exportar CSV”.
2. Se descarga un archivo listo para abrir en Excel, Google Sheets o LibreOffice.

### Exportar JSON
Permite descargar la agenda en formato JSON.

Qué hace:
- genera un archivo estructurado con la información del paciente
- útil para backups técnicos o migraciones a otros sistemas

Cómo se usa:
1. Click en “Exportar JSON”.
2. Se descarga un archivo con la estructura completa de los datos.

## Recomendaciones prácticas para la clínica

- Realizar backup al menos una vez al día.
- Guardar los backups en una carpeta segura y con nombre claro.
- Antes de importar un CSV, revisar que los campos vengan completos.
- Mantener actualizada la base de pacientes y las fechas de turnos.
- Usar exportación CSV si se quiere trabajar con una planilla.
- Usar exportación JSON si se quiere conservar la estructura completa o migrar datos.

## Nota

La aplicación usa SQLite para persistir los pacientes y los archivos se guardan en la carpeta `uploads` dentro del proyecto.
