/**
 * Backups automáticos del spreadsheet en Drive.
 * Requiere scope de Drive en appsscript.json.
 */
function crearBackupDiario() {
  const ss = getSpreadsheet();
  const iteradorCarpetas = DriveApp.getFoldersByName('Backups_SolYVerde');
  const carpetaBackups = iteradorCarpetas.hasNext()
    ? iteradorCarpetas.next()
    : DriveApp.createFolder('Backups_SolYVerde');

  const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const nombreBackup = 'Backup_Auto_' + fecha + '_' + ss.getName();

  DriveApp.getFileById(ss.getId()).makeCopy(nombreBackup, carpetaBackups);
}
