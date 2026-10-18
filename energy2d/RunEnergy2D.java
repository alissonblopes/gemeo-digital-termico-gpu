import org.concord.energy2d.system.System2D;
import org.concord.energy2d.model.*;
import org.concord.energy2d.view.View2D;
import java.io.*;
import java.nio.file.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import javax.swing.SwingUtilities;
import java.lang.reflect.*;
import java.util.Locale;

/** Real upstream Energy2D API, not an independent replacement simulator.
 * Qualitative natural-convection transverse section; no quantitative GPU claim.
 * Units: metres, seconds, W/m3 source. Effective extrusion length0.18m.
 */
public class RunEnergy2D {
    static Part rectangle(Model2D m, float x, float y, float w, float h, float k, float rho, float cp, String label) {
        Part p = m.addRectangularPart(x, y, w, h);
        p.setThermalConductivity(k); p.setDensity(rho); p.setSpecificHeat(cp);
        p.setTemperature(25); p.setConstantTemperature(false); p.setEmissivity(0);
        p.setFilled(false); p.setLabel(label);
        return p;
    }
    public static void main(String[] args) throws Exception {
        Locale.setDefault(Locale.US);
        Path root = Path.of(args[0]);
        Files.createDirectories(root.resolve("energy2d")); Files.createDirectories(root.resolve("figures"));
        System2D system = new System2D();
        system.init();
        Model2D m = system.getModel();
        m.clear();
        m.setLx(.1f); m.setLy(.06f);
        m.setTimeStep(.0005f);
        m.setSunny(false); m.setConvective(true);
        m.setBackgroundTemperature(25); m.setBackgroundConductivity(.0263f);
        m.setBackgroundDensity(1.184f); m.setBackgroundSpecificHeat(1006f);
        m.setBackgroundViscosity(.0000156f);
        m.setThermalExpansionCoefficient(1f/298.15f); m.setGravitationalAcceleration(9.8f);
        DirichletThermalBoundary boundary = new DirichletThermalBoundary();
        for (byte b=0;b<4;b++) boundary.setTemperatureAtBorder(b,25);
        m.setThermalBoundary(boundary);
        rectangle(m,.005f,.035f,.09f,.006f,201,2700,900,"Al6063-T6");
        for (int i=0;i<20;i++) rectangle(m,.01625f+i*.0035f,.015f,.001f,.02f,201,2700,900,"");
        rectangle(m,.03f,.041f,.04f,.003f,391,8910,385,"CuC11000");
        Part source=rectangle(m,.035f,.044f,.03f,.001f,3,2000,700,"Fonte equivalente");
        float geometricPower=(float)(170.0/(.18*.03*.001));
        source.setPower(geometricPower);
        m.refreshMaterialPropertyArrays(); m.refreshPowerArray(); m.refreshTemperatureBoundaryArray(); m.setInitialTemperature();
        // Match integrated power on the actual raster rather than assume exact CAD-cell alignment.
        Field qField=Model2D.class.getDeclaredField("q"); qField.setAccessible(true);
        float[][] q=(float[][])qField.get(m);
        double integrated=0; for(float[] row:q) for(float value:row) integrated+=value;
        double dx=m.getLx()/m.getNx(), dy=m.getLy()/m.getNy(); integrated*=dx*dy*.18;
        source.setPower((float)(geometricPower*170.0/integrated)); m.refreshPowerArray();
        q=(float[][])qField.get(m); double actual=0; for(float[] row:q) for(float value:row) actual+=value;
        actual*=dx*dy*.18;
        View2D view=system.getView(); view.setSize(1200,720); view.setArea(0,.1f,0,.06f);
        view.setMinimumTemperature(25); view.setMaximumTemperature(40);
        view.setColorPaletteOn(true); view.setColorPaletteType(View2D.IRON); view.setSeeThrough(true);
        view.setClockOn(true); view.setBorderTickmarksOn(true); view.setShowLogo(true);
        view.setControlPanelVisible(false); view.setVelocityOn(false); view.setHeatFluxArrowsOn(false);
        try(OutputStream out=Files.newOutputStream(root.resolve("energy2d/heatsink.e2d"))){system.saveState(out);}
        // Use the genuine private step method for deterministic finite batch execution;
        // reflection is isolated here, not a modified solver. Native UI remains usable.
        Method step=Model2D.class.getDeclaredMethod("nextStep"); step.setAccessible(true);
        try(PrintWriter out=new PrintWriter(root.resolve("energy2d/transient_energy2d.csv").toFile())){
            out.println("time_s,source_center_C,copper_center_C,fin_center_C");
            for(int i=0;i<=20000;i++){
                if(i%2000==0) out.printf("%.6f,%.7f,%.7f,%.7f%n",m.getTime(),m.getTemperatureAt(.05f,.0445f),m.getTemperatureAt(.05f,.0425f),m.getTemperatureAt(.04825f,.025f));
                if(i<20000)step.invoke(m);
            }
        }
        float min=Float.POSITIVE_INFINITY,max=Float.NEGATIVE_INFINITY;
        for(float[] row:m.getTemperature())for(float v:row){if(!Float.isFinite(v))throw new IllegalStateException("Nonfinite Energy2D temperature");min=Math.min(min,v);max=Math.max(max,v);}
        final float maxTemp=max;
        SwingUtilities.invokeAndWait(()->{
            javax.swing.JFrame frame=new javax.swing.JFrame("Energy2D — estudo térmico didático");
            frame.setUndecorated(true);view.setPreferredSize(new Dimension(1200,720));
            frame.setContentPane(view);frame.pack();frame.setVisible(true);frame.validate();
            view.setTime(m.getTime()); view.setMaximumTemperature(Math.max(30,maxTemp));
            BufferedImage image=new BufferedImage(1200,720,BufferedImage.TYPE_INT_RGB);
            Graphics2D graphics=image.createGraphics();view.paint(graphics);graphics.dispose();
            try{ImageIO.write(image,"png",root.resolve("figures/energy2d_simulation.png").toFile());}catch(IOException ex){throw new RuntimeException(ex);}
            frame.dispose();
        });
        try(PrintWriter out=new PrintWriter(root.resolve("energy2d/execution.json").toFile())){
            out.printf("{\"engine\":\"Official Concord Consortium Energy2D Java artifact\",\"nx\":%d,\"ny\":%d,\"dt_s\":%.8f,\"time_s\":%.6f,\"source_power_density_W_m3\":%.6f,\"raster_integrated_power_W_for_018m\":%.6f,\"geometric_power_density_W_m3\":%.6f,\"grid_min_C\":%.7f,\"grid_max_C\":%.7f,\"source_center_C\":%.7f,\"notes\":\"Qualitative natural convection; boundaries25C; no radiation; 0.18m uniform extrusion changes actual Cu/source3D volumes; not Python validation nor equilibrium. Grid100 cannot accurately resolve1mm fins.\"}%n",m.getNx(),m.getNy(),m.getTimeStep(),m.getTime(),source.getPower(),actual,(double)geometricPower,min,max,m.getTemperatureAt(.05f,.0445f));
        }
        // Prove native persisted file can be loaded by the actual decoder.
        System2D loaded=new System2D();loaded.init();
        try(InputStream input=Files.newInputStream(root.resolve("energy2d/heatsink.e2d"))){loaded.loadState(input);}
        if(loaded.getModel().getPartCount()!=23)throw new IllegalStateException("Native e2d reload changed parts");
        System.out.printf("Energy2D grid%dx%d; time%.3fs; source%.3fC; range%.3f..%.3fC; integrated power%.6fW; native reload23parts%n",m.getNx(),m.getNy(),m.getTime(),m.getTemperatureAt(.05f,.0445f),min,max,actual);
        system.destroy();loaded.destroy();System.exit(0);
    }
}
