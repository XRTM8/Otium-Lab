package com.otium.reader;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import java.io.File;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;

public final class ScannerCameraTrialActivity extends ComponentActivity {
    private static final int CAMERA_PERMISSION = 32;
    private PreviewView previewView;
    private TextView status;
    private Button shutter;
    private Button torch;
    private Camera camera;
    private ImageCapture capture;
    private boolean torchOn;

    @Override
    public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        previewView = new PreviewView(this);
        previewView.setScaleType(PreviewView.ScaleType.FIT_CENTER);
        layout.addView(previewView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        status = new TextView(this);
        layout.addView(status);
        shutter = new Button(this);
        shutter.setText("Capture JPEG");
        shutter.setEnabled(false);
        shutter.setOnClickListener(view -> takePhoto());
        layout.addView(shutter);
        torch = new Button(this);
        torch.setText("Torch");
        torch.setEnabled(false);
        torch.setOnClickListener(view -> {
            torchOn = !torchOn;
            camera.getCameraControl().enableTorch(torchOn);
        });
        layout.addView(torch);
        FrameLayout root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        root.addView(layout);
        setContentView(root);
        previewView.setOnTouchListener((view, event) -> {
            if (event.getAction() == MotionEvent.ACTION_UP && camera != null) {
                view.performClick();
                androidx.camera.core.MeteringPoint point = previewView.getMeteringPointFactory().createPoint(event.getX(), event.getY());
                camera.getCameraControl().startFocusAndMetering(new FocusMeteringAction.Builder(point)
                    .setAutoCancelDuration(3, TimeUnit.SECONDS).build());
            }
            return true;
        });
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_PERMISSION);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != CAMERA_PERMISSION) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startCamera();
        else status.setText("Camera permission denied");
    }

    private void startCamera() {
        Executor main = ContextCompat.getMainExecutor(this);
        com.google.common.util.concurrent.ListenableFuture<ProcessCameraProvider> providerFuture = ProcessCameraProvider.getInstance(this);
        providerFuture.addListener(() -> {
            if (isDestroyed()) return;
            try {
                ProcessCameraProvider provider = providerFuture.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                capture = new ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                    .build();
                camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture);
                status.setText("Tap the preview to focus");
                torch.setEnabled(camera.getCameraInfo().hasFlashUnit());
                shutter.setEnabled(true);
            } catch (Exception error) {
                status.setText("Camera unavailable");
                Log.w("ScannerCameraTrial", "Camera binding failed", error);
            }
        }, main);
    }

    private void takePhoto() {
        if (capture == null || previewView.getDisplay() == null) return;
        capture.setTargetRotation(previewView.getDisplay().getRotation());
        shutter.setEnabled(false);
        status.setText("Saving JPEG…");
        File directory = new File(getFilesDir(), "scanner-trial");
        if (!directory.isDirectory() && !directory.mkdirs()) {
            status.setText("Could not create output directory");
            shutter.setEnabled(true);
            return;
        }
        long started = SystemClock.elapsedRealtime();
        File target = new File(directory, "camerax-" + System.currentTimeMillis() + ".jpg");
        capture.takePicture(new ImageCapture.OutputFileOptions.Builder(target).build(),
            ContextCompat.getMainExecutor(this), new ImageCapture.OnImageSavedCallback() {
                @Override
                public void onImageSaved(ImageCapture.OutputFileResults result) {
                    long ms = SystemClock.elapsedRealtime() - started;
                    String message = target.getName() + " | " + ms + " ms | " + target.length() + " bytes";
                    Log.i("ScannerCameraTrial", message);
                    status.setText(message);
                    shutter.setEnabled(true);
                }

                @Override
                public void onError(ImageCaptureException error) {
                    if (target.isFile() && !target.delete()) Log.w("ScannerCameraTrial", "Could not remove incomplete JPEG");
                    Log.w("ScannerCameraTrial", "Capture failed", error);
                    status.setText("Capture failed: " + error.getImageCaptureError());
                    shutter.setEnabled(true);
                }
            });
    }
}
