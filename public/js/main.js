var baseurl = 'http://cryptographs.herokuapp.com';
$.get(baseurl+'/WDC', function(data, status){
    $('#body').html(data);
});

$.get(baseurl+'/helloData', function(data, status){
    console.log(data);
});