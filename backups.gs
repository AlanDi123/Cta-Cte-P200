/**
 * Backups automáticos del spreadsheet en Drive.
 * Intenta Drive API v3 (más rápido); si falla, DriveApp.
 */
function crearBackupDiario() {
  const ss = getSpreadsheet();
  const iteradorCarpetas = DriveApp.getFoldersByName('Backups_SolYVerde');
  const carpetaBackups = iteradorCarpetas.hasNext()
    ? iteradorCarpetas.next()
    : DriveApp.createFolder('Backups_SolYVerde');

  const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const nombreBackup = 'Backup_Auto_' + fecha + '_' + ss.getName();
  const folderId = carpetaBackups.getId();
  const fileId = ss.getId();

  try {
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.copy) {
      Drive.Files.copy(
        { name: nombreBackup, parents: [folderId] },
        fileId,
        { fields: 'id,name' }
      );
      return;
    }
  } catch (e) {
    Logger.log('[BACKUP] Drive API copy falló, usando DriveApp: ' + e.message);
  }

  DriveApp.getFileById(fileId).makeCopy(nombreBackup, carpetaBackups);
}
