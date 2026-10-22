using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Windows.Forms;

internal static class Setup {
    [STAThread] static int Main(string[] args) {
        try {
            if (args.Length == 1 && args[0] == "--verify-payload") { using (var payload = Payload()) { Validate(payload, null); } return 0; }
            if (args.Length != 0) throw new Exception("Open this setup file without command-line arguments.");
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupWindow()); return 0;
        } catch (Exception error) {
            if (args.Length == 0) MessageBox.Show(error.Message, "Playlist Sync setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
    static MemoryStream Payload() {
        var bytes = new MemoryStream();
        using (var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Payload.zip")) {
            if (resource == null) throw new Exception("Setup payload is missing."); resource.CopyTo(bytes);
        }
        bytes.Position = 0;
        using (var sha = SHA256.Create()) {
            if (BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant() != Build.PayloadHash) throw new Exception("Setup payload verification failed.");
        }
        bytes.Position = 0; return bytes;
    }
    static void Validate(Stream bytes, string destination) {
        using (var archive = new ZipArchive(bytes, ZipArchiveMode.Read, true)) {
            bool installer = false;
            foreach (var item in archive.Entries) {
                string name = item.FullName.Replace('/', '\\');
                if (Path.IsPathRooted(name) || name.Contains(":") || Array.Exists(name.Split('\\'), part => part == "..")) throw new Exception("Unsafe setup entry.");
                if (name == "Install-Playlist-Sync.ps1") installer = true;
                if (destination == null) continue;
                string path = Path.GetFullPath(Path.Combine(destination, name));
                if (!path.StartsWith(destination + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("Unsafe setup path.");
                if (name.EndsWith("\\")) { Directory.CreateDirectory(path); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                using (var source = item.Open()) using (var file = new FileStream(path, FileMode.CreateNew)) { source.CopyTo(file); }
            }
            if (!installer) throw new Exception("Setup entry point is missing.");
        }
    }
    internal static void Install(bool automatic, string existing, Action<string> progress) {
        string temp = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "playlist-sync-setup-" + Guid.NewGuid().ToString("N")));
        Directory.CreateDirectory(temp);
        try {
            using (var payload = Payload()) { Validate(payload, temp); }
            string shell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"System32\WindowsPowerShell\v1.0\powershell.exe");
            if (existing != null && (!Path.IsPathRooted(existing) || existing.Contains("\""))) throw new Exception("Invalid installation folder.");
            var info = new ProcessStartInfo(shell, "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + Path.Combine(temp, "Install-Playlist-Sync.ps1") + "\" -NoLaunch" + (automatic ? " -StartWithRbxport" : "") + (existing == null ? "" : " -ExistingDirectory \"" + existing.TrimEnd('\\') + "\""));
            info.UseShellExecute = false; info.CreateNoWindow = true; info.WindowStyle = ProcessWindowStyle.Hidden;
            info.RedirectStandardOutput = true; info.RedirectStandardError = true;
            string failure = "";
            using (var process = new Process()) {
                process.StartInfo = info;
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (!String.IsNullOrWhiteSpace(e.Data)) progress(e.Data); };
                process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) { lock (info) { failure = (failure + e.Data + Environment.NewLine); if (failure.Length > 6000) failure = failure.Substring(failure.Length - 6000); } } };
                process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine(); process.WaitForExit();
                if (process.ExitCode != 0) throw new Exception(String.IsNullOrWhiteSpace(failure) ? "Setup did not complete. Your saved data was kept." : failure);
            }
        } finally {
            string parent = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (temp.StartsWith(parent, StringComparison.OrdinalIgnoreCase) && Path.GetFileName(temp).StartsWith("playlist-sync-setup-")) {
                // Every file was extracted here; never follow a junction during cleanup.
                try { DeleteTemporary(temp); } catch { /* A locked temporary file can remain for Windows cleanup. */ }
            }
        }
    }
    static void DeleteTemporary(string directory) {
        if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0) return;
        foreach (string child in Directory.GetDirectories(directory)) DeleteTemporary(child);
        foreach (string file in Directory.GetFiles(directory)) if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) == 0) File.Delete(file);
        if (Directory.GetFileSystemEntries(directory).Length == 0) Directory.Delete(directory);
    }
}

internal sealed class SetupWindow : Form {
    readonly CheckBox automatic = new CheckBox();
    readonly Button install = new Button();
    readonly Label status = new Label();
    readonly LinkLabel choose = new LinkLabel();
    string existing;
    bool running;
    internal SetupWindow() {
        Text = "Playlist Sync setup"; ClientSize = new Size(540, 370); FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; StartPosition = FormStartPosition.CenterScreen; Font = new Font("Segoe UI", 10);
        var title = new Label { Text = "Install or update Playlist Sync", Font = new Font("Segoe UI", 19, FontStyle.Bold), Location = new Point(24, 20), Size = new Size(490, 42) };
        var intro = new Label { Text = "Finds your installed copy and keeps music and saved settings.\nStop Playlist Sync before updating. Internet is required.\nAn unregistered portable copy? Choose its folder below.", Location = new Point(26, 76), Size = new Size(486, 78) };
        automatic.Text = "Show Playlist Sync when rbxport opens"; automatic.Checked = true; automatic.Location = new Point(26, 158); automatic.Size = new Size(480, 28);
        choose.Text = "Choose existing folder (optional)"; choose.Location = new Point(26, 198); choose.Size = new Size(485, 28);
        choose.LinkClicked += delegate { using (var dialog = new FolderBrowserDialog { Description = "Select your existing Playlist Sync folder", ShowNewFolderButton = false }) { if (dialog.ShowDialog(this) == DialogResult.OK) { existing = dialog.SelectedPath; status.Text = "Update: " + existing; } } };
        status.Text = "Version " + Build.Version + " · No administrator access required"; status.Location = new Point(26, 240); status.Size = new Size(485, 66);
        install.Text = "Install / Update"; install.Location = new Point(374, 322); install.Size = new Size(140, 34);
        Controls.AddRange(new Control[] { title, intro, automatic, choose, status, install });
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (running) e.Cancel = true; };
        install.Click += delegate {
            if (install.Text == "Close") { Close(); return; }
            bool attach = automatic.Checked; running = true; install.Enabled = false; automatic.Enabled = false; choose.Enabled = false; status.Text = "Preparing setup…";
            var worker = new BackgroundWorker();
            worker.DoWork += delegate { Setup.Install(attach, existing, line => { BeginInvoke((Action)(() => status.Text = line)); }); };
            worker.RunWorkerCompleted += delegate(object sender, RunWorkerCompletedEventArgs e) {
                running = false; install.Enabled = true;
                if (e.Error != null) { status.Text = "Setup could not finish."; automatic.Enabled = true; choose.Enabled = true; MessageBox.Show(this, e.Error.Message, "Playlist Sync setup", MessageBoxButtons.OK, MessageBoxIcon.Error); }
                else { status.Text = attach ? "Installed. Open rbxport normally. If it is already open, close and reopen it once. Uninstall is in Playlist Sync settings." : "Installed. Open the Playlist Sync shortcut. Uninstall is in Playlist Sync settings."; install.Text = "Close"; }
                worker.Dispose();
            };
            worker.RunWorkerAsync();
        };
    }
}
