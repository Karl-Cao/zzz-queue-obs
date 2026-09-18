using System;
using System.Collections.Generic;
using System.Drawing;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public sealed class QueueDesktop : Form {
 [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h,int n);
 [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h,int n,int v);
 [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h,int id,uint mods,uint key);
 [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h,int id);
 [DllImport("user32.dll")] static extern bool ReleaseCapture();
 [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l);
 readonly HttpClient http=new HttpClient(new HttpClientHandler{UseProxy=false});
 readonly JavaScriptSerializer json=new JavaScriptSerializer();
 readonly Timer timer=new Timer(); readonly NotifyIcon tray=new NotifyIcon();
 readonly Label heading=new Label(), status=new Label(), currentView=new Label();
 static bool English;
 static string T(string zh,string en){return English?en:zh;} readonly FlowLayoutPanel rows=new FlowLayoutPanel(), actions=new FlowLayoutPanel();
 readonly Color acid=Color.FromArgb(233,250,55), dark=Color.FromArgb(25,27,22);
 readonly TextBox chatView=new TextBox();
 bool editing=false, polling=false, busy=false, online=false; string signature="", firstUid="", currentUid="", baseUrl;
 public QueueDesktop(int port) {
  baseUrl="http://127.0.0.1:"+port; http.Timeout=TimeSpan.FromSeconds(3);http.DefaultRequestHeaders.Add("Origin",baseUrl);
  Text="ZZZ Queue Desktop";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;BackColor=dark;ForeColor=Color.WhiteSmoke;Opacity=.90;
  Font=new Font("Microsoft YaHei UI",10);Size=new Size(410,730);StartPosition=FormStartPosition.Manual;Location=new Point(Screen.PrimaryScreen.WorkingArea.Right-430,70);
  heading.SetBounds(12,10,386,48);heading.ForeColor=acid;heading.Font=new Font(Font.FontFamily,11,FontStyle.Bold);heading.MouseDown+=(s,e)=>{if(editing&&e.Button==MouseButtons.Left){ReleaseCapture();SendMessage(Handle,0xA1,(IntPtr)2,IntPtr.Zero);}};Controls.Add(heading);
  status.SetBounds(12,62,386,42);status.Font=new Font(Font.FontFamily,9);Controls.Add(status);
  currentView.SetBounds(12,104,386,56);currentView.ForeColor=acid;Controls.Add(currentView);
  rows.SetBounds(12,166,386,212);rows.FlowDirection=FlowDirection.TopDown;rows.WrapContents=false;rows.AutoScroll=true;Controls.Add(rows);
  actions.SetBounds(12,384,386,74);Controls.Add(actions);
  var chatTitle=new Label{Text=T("LAPLACE / 实时弹幕 · 仅自己可见","LAPLACE / Live chat · Desktop only"),ForeColor=acid};chatTitle.SetBounds(12,466,386,26);Controls.Add(chatTitle);
  chatView.SetBounds(12,495,386,220);chatView.Multiline=true;chatView.ReadOnly=true;chatView.ScrollBars=ScrollBars.Vertical;chatView.BackColor=dark;chatView.ForeColor=Color.WhiteSmoke;chatView.BorderStyle=BorderStyle.None;Controls.Add(chatView);
  AddButton(actions,T("重播","Repeat"),()=>Post(new {type="call"}));AddButton(actions,T("完成当前并继续","Complete & next"),()=>Post(new{type="advance",currentUid=currentUid==""?null:currentUid,nextUid=firstUid==""?null:firstUid}));
  AddButton(actions,T("抽奖","Lottery"),()=>Post(new{type="start"}));AddButton(actions,T("开奖","Draw"),()=>Post(new{type="finish"}));
  AddButton(actions,T("语音测试","Voice test"),()=>Post(new{},"/api/speech/test"));AddButton(actions,T("控制台","Dashboard"),()=>System.Diagnostics.Process.Start(baseUrl+"/live"));
  var menu=new ContextMenuStrip();menu.Items.Add(T("切换操作 / 穿透 (Ctrl+Alt+Q)","Toggle controls / click-through (Ctrl+Alt+Q)"),null,(s,e)=>Toggle());menu.Items.Add(T("显示 / 隐藏 (Ctrl+Alt+H)","Show / hide (Ctrl+Alt+H)"),null,(s,e)=>{Visible=!Visible;});menu.Items.Add(T("退出悬浮窗","Exit overlay"),null,(s,e)=>Close());
  tray.Icon=SystemIcons.Application;tray.Text=T("ZZZ Queue · Ctrl+Alt+Q 操作","ZZZ Queue · Ctrl+Alt+Q controls");tray.ContextMenuStrip=menu;tray.Visible=true;tray.DoubleClick+=(s,e)=>Toggle();
  timer.Interval=1000;timer.Tick+=(s,e)=>Poll();
  Shown+=(s,e)=>{bool q=RegisterHotKey(Handle,1,0x4003,(uint)Keys.Q);bool h=RegisterHotKey(Handle,2,0x4003,(uint)Keys.H);SetMode();if(!q||!h){tray.ShowBalloonTip(6000,T("快捷键已占用","Shortcut unavailable"),T("可右键系统托盘图标切换操作模式。","Right-click the tray icon to toggle controls."),ToolTipIcon.Warning);}timer.Start();Poll();};
  FormClosed+=(s,e)=>{timer.Stop();timer.Dispose();UnregisterHotKey(Handle,1);UnregisterHotKey(Handle,2);tray.Dispose();http.Dispose();};
 }
 protected override bool ShowWithoutActivation{get{return true;}}
 protected override CreateParams CreateParams{get{var p=base.CreateParams;p.ExStyle|=0x80000|0x20|0x08000000|0x80;return p;}}
 protected override void WndProc(ref Message m){if(m.Msg==0x312){if(m.WParam.ToInt32()==1)Toggle();else if(m.WParam.ToInt32()==2)Visible=!Visible;}base.WndProc(ref m);}
 void Toggle(){editing=!editing;Visible=true;SetMode();signature="";Poll();if(editing)Activate();}
 void SetMode(){int style=GetWindowLong(Handle,-20);SetWindowLong(Handle,-20,editing?style&~(0x20|0x08000000):style|0x20|0x08000000);heading.Text=editing?T("委托终端 // 操作模式 · 拖动此处移动\nCtrl+Alt+Q 返回鼠标穿透","QUEUE // Controls · Drag here to move\nCtrl+Alt+Q for click-through"):T("委托终端 // 鼠标穿透\nCtrl+Alt+Q 操作 · Ctrl+Alt+H 隐藏","QUEUE // Click-through\nCtrl+Alt+Q controls · Ctrl+Alt+H hide");actions.Visible=editing;rows.Height=editing?212:280;}
 void AddButton(Control parent,string title,Action action){var b=new Button{Text=title,AutoSize=true,Height=32,BackColor=dark,ForeColor=acid,FlatStyle=FlatStyle.Flat,Margin=new Padding(2)};b.Click+=(s,e)=>action();parent.Controls.Add(b);}
 async void Post(object payload,string path="/api/action"){
  if(busy||!online)return;busy=true;actions.Enabled=false;rows.Enabled=false;
  try{using(var response=await http.PostAsync(baseUrl+path,new StringContent(json.Serialize(payload),Encoding.UTF8,"application/json"))){if(!response.IsSuccessStatusCode){var err=json.Deserialize<Dictionary<string,object>>(await response.Content.ReadAsStringAsync());throw new Exception(Convert.ToString(err["error"]));}}signature="";}
  catch(Exception e){tray.ShowBalloonTip(5000,T("操作失败","Action failed"),e.Message,ToolTipIcon.Warning);}
  finally{busy=false;actions.Enabled=true;rows.Enabled=true;Poll();}
 }
 async void Poll(){
  if(polling||IsDisposed)return;polling=true;
  try{string raw=await http.GetStringAsync(baseUrl+"/api/desktop");if(IsDisposed)return;var state=json.Deserialize<Dictionary<string,object>>(raw);online=true;status.ForeColor=Color.Silver;status.Text=T("已连接 · 礼物累计排序 / 中奖置顶","Connected · Gifts ranked / winners pinned");
   var messages=(System.Collections.ArrayList)state["chat"];var chatText=new StringBuilder();foreach(Dictionary<string,object> msg in messages){chatText.Append(Convert.ToString(msg["username"])).Append(": ");if(Convert.ToString(msg["type"])=="gift")chatText.Append(T("赠送 ","Gift: ")).Append(msg["giftName"]).Append(" × ").Append(msg["quantity"]);else chatText.Append(msg["message"]);chatText.AppendLine().AppendLine();}string text=chatText.Length==0?T("等待实时弹幕…","Waiting for chat…"):chatText.ToString();if(chatView.Text!=text)chatView.Text=text;
   var current=state["current"] as Dictionary<string,object>;currentUid=current==null?"":Convert.ToString(current["uid"]);currentView.Text=T("当前: ","Current: ")+(current==null?T("暂无","None"):Convert.ToString(current["username"]))+"\n"+T("接下来 ↓","Up next ↓");
   var queue=(System.Collections.ArrayList)state["queue"];firstUid=queue.Count>0?Convert.ToString(((Dictionary<string,object>)queue[0])["uid"]):"";
   string next=json.Serialize(queue)+editing;if(next!=signature){signature=next;rows.SuspendLayout();while(rows.Controls.Count>0){var old=rows.Controls[0];rows.Controls.Remove(old);old.Dispose();}
    int index=0;foreach(Dictionary<string,object> item in queue){if(++index>100)break;string uid=Convert.ToString(item["uid"]);var p=new FlowLayoutPanel{Width=360,Height=62,BackColor=index==1?Color.FromArgb(61,67,25):dark,Margin=new Padding(0,0,0,4)};
     var label=new Label{Width=editing?268:350,Height=56,AutoEllipsis=true,Text=String.Format("{0:00}  {1}\n¥{2:0.00} {3}",index,item["username"],Convert.ToDecimal(item["cents"])/100,item.ContainsKey("pin")?T("★ 抽奖置顶","★ Winner"):""),ForeColor=index==1?acid:Color.WhiteSmoke};p.Controls.Add(label);if(editing)AddButton(p,T("移除","Remove"),()=>Post(new{type="remove",uid=uid}));rows.Controls.Add(p);}
    if(queue.Count==0)rows.Controls.Add(new Label{Text=T("STANDBY / 等待观众加入","STANDBY / Waiting for viewers"),Width=350,Height=60,ForeColor=acid});rows.ResumeLayout();}
  }catch{if(!IsDisposed){online=false;status.ForeColor=Color.Salmon;status.Text=T("连接中断 · 显示上次队列 · 自动重连","Disconnected · Showing last state · Reconnecting");}}finally{polling=false;}
 }
 [STAThread] public static void Main(string[] args){English=args.Length>1&&args[1]=="en";Run(Int32.Parse(args[0]));}
 [STAThread] public static void Run(int port){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new QueueDesktop(port));}
}
